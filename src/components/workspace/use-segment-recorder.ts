"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Длина фрагмента: каждый фрагмент — самостоятельный аудиофайл, который сразу отправляется на распознавание. */
const SEGMENT_MS = 15_000;
/** Ниже этого уровня (RMS, ≈ −60 дБ) фрагмент считается тишиной. Порог намеренно низкий: тихую речь лучше распознать, чем потерять. */
const SILENCE_RMS = 0.001;
const MAX_ATTEMPTS = 4;

export type UploadedSegment = { id: string; seq: number; status: "pending" | "done" | "failed"; text: string; error: string | null };

export type QueueItem = {
  seq: number;
  blob: Blob;
  duration: number;
  silent: boolean;
  state: "queued" | "uploading" | "failed";
  attempts: number;
  error?: string;
};

export type Phase = "idle" | "starting" | "recording" | "stopping";

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

const extFor = (mime: string) => (mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class UploadError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
  ) {
    super(message);
  }
}

export function useSegmentRecorder(opts: { appointmentId: string; onSegment: (s: UploadedSegment) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const runningRef = useRef(false);
  const seqRef = useRef(0);
  const peakRef = useRef(0);
  const queueRef = useRef<QueueItem[]>([]);
  const pumpingRef = useRef(false);
  const timersRef = useRef<{ seg?: ReturnType<typeof setTimeout>; tick?: ReturnType<typeof setInterval>; meter?: ReturnType<typeof setInterval> }>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopResolveRef = useRef<(() => void) | null>(null);
  const startedAtRef = useRef(0);
  const onSegmentRef = useRef(opts.onSegment);
  onSegmentRef.current = opts.onSegment;

  const syncQueue = () => setQueue([...queueRef.current]);

  const upload = useCallback(
    async (item: QueueItem) => {
      const form = new FormData();
      form.append("audio", item.blob, `segment-${item.seq}.${extFor(item.blob.type)}`);
      form.append("seq", String(item.seq));
      form.append("duration", item.duration.toFixed(1));
      form.append("source", "microphone");
      if (item.silent) form.append("silent", "1");
      let res: Response;
      try {
        res = await fetch(`/api/appointments/${opts.appointmentId}/segments`, { method: "POST", body: form });
      } catch {
        throw new UploadError("Нет связи с сервером", true);
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new UploadError(data.error || `Ошибка ${res.status}`, res.status >= 500 || res.status === 429 || res.status === 408);
      return data as UploadedSegment;
    },
    [opts.appointmentId],
  );

  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    try {
      for (;;) {
        const item = queueRef.current.find((i) => i.state === "queued");
        if (!item) break;
        item.state = "uploading";
        syncQueue();
        try {
          const seg = await upload(item);
          queueRef.current = queueRef.current.filter((i) => i !== item);
          onSegmentRef.current(seg);
        } catch (err) {
          const e = err as UploadError;
          item.attempts += 1;
          item.error = e.message;
          if (e.retryable && item.attempts < MAX_ATTEMPTS) {
            item.state = "queued";
            syncQueue();
            await sleep(2000 * 2 ** (item.attempts - 1));
          } else {
            item.state = "failed";
          }
        }
        syncQueue();
      }
    } finally {
      pumpingRef.current = false;
    }
  }, [upload]);

  const retryFailed = useCallback(() => {
    for (const i of queueRef.current) if (i.state === "failed") Object.assign(i, { state: "queued", attempts: 0 });
    syncQueue();
    void pump();
  }, [pump]);

  const startSegment = useCallback(
    (mimeType: string) => {
      const stream = streamRef.current!;
      const rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
      const chunks: Blob[] = [];
      const started = performance.now();
      peakRef.current = 0;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: (rec.mimeType || mimeType || "audio/webm").split(";")[0] });
        const duration = (performance.now() - started) / 1000;
        // Пропускаем распознавание только если индикатор уровня точно работал и сигнал был, но очень слабый.
        // При сомнениях (анализатор не запущен, нулевые отсчёты) фрагмент отправляется на распознавание.
        const meterOk = audioCtxRef.current?.state === "running" && peakRef.current > 0;
        const silent = meterOk && peakRef.current < SILENCE_RMS;
        if (blob.size > 0 && duration > 0.5) {
          queueRef.current.push({ seq: seqRef.current++, blob, duration, silent, state: "queued", attempts: 0 });
          syncQueue();
          void pump();
        }
        if (runningRef.current) startSegment(mimeType);
        else stopResolveRef.current?.();
      };
      rec.start();
      recorderRef.current = rec;
      timersRef.current.seg = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, SEGMENT_MS);
    },
    [pump],
  );

  const releaseMedia = () => {
    clearInterval(timersRef.current.tick);
    clearInterval(timersRef.current.meter);
    clearTimeout(timersRef.current.seg);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  };

  /**
   * Сначала включает микрофон, затем вызывает begin() — отметку начала записи на сервере,
   * которая возвращает номер следующего фрагмента (для продолжения записи).
   */
  const start = useCallback(
    async (begin: () => Promise<number>) => {
      setError(null);
      const mimeType = pickMimeType();
      if (mimeType === null || !navigator.mediaDevices?.getUserMedia) {
        setError("Браузер не поддерживает запись звука. Используйте актуальный Chrome, Edge, Firefox или Safari.");
        return false;
      }
      setPhase("starting");
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        });
      } catch (err) {
        setPhase("idle");
        const name = (err as DOMException).name;
        setError(
          name === "NotAllowedError"
            ? "Доступ к микрофону запрещён. Разрешите доступ в настройках браузера."
            : name === "NotFoundError"
              ? "Микрофон не найден."
              : `Не удалось включить микрофон: ${(err as Error).message}`,
        );
        return false;
      }
      try {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(streamRef.current).connect(analyser);
        audioCtxRef.current = ctx;
        // Не ждём: без активации пользователя промис может не разрешиться.
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
        const buf = new Float32Array(analyser.fftSize);
        timersRef.current.meter = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += v * v;
          const rms = Math.sqrt(sum / buf.length);
          peakRef.current = Math.max(peakRef.current, rms);
          setLevel(Math.min(1, rms * 8));
        }, 100);
      } catch {
        peakRef.current = 1; // без анализатора не считаем фрагменты тишиной
      }
      try {
        seqRef.current = await begin();
      } catch (err) {
        releaseMedia();
        setPhase("idle");
        setError((err as Error).message);
        return false;
      }
      runningRef.current = true;
      startedAtRef.current = Date.now();
      setElapsed(0);
      timersRef.current.tick = setInterval(() => setElapsed((Date.now() - startedAtRef.current) / 1000), 500);
      startSegment(mimeType);
      setPhase("recording");
      return true;
    },
    [startSegment],
  );

  /** Останавливает запись и ждёт отправки всех фрагментов (кроме окончательно неотправленных). */
  const stop = useCallback(async () => {
    setPhase("stopping");
    runningRef.current = false;
    clearTimeout(timersRef.current.seg);
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      await new Promise<void>((resolve) => {
        stopResolveRef.current = resolve;
        rec.stop();
      });
    }
    releaseMedia();
    while (queueRef.current.some((i) => i.state !== "failed") || pumpingRef.current) await sleep(300);
    setPhase("idle");
    return queueRef.current.length === 0;
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (runningRef.current || queueRef.current.length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      runningRef.current = false;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      releaseMedia();
    };
  }, []);

  return { phase, elapsed, level, queue, error, start, stop, retryFailed };
}
