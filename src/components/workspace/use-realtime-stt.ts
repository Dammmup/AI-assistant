"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Speaker } from "@/lib/types";
import { PCM_SAMPLE_RATE, recorderOptions, startPcm16k } from "./audio-capture";

/** Законченная реплика потокового распознавания: один голос, до паузы или смены говорящего. */
export type LiveUtterance = {
  clientId: string;
  sessionId: string;
  speakerId: string;
  language: string | null;
  text: string;
  startAt: number; // epoch ms
  endAt: number;
};

export type RealtimeStatus = "off" | "connecting" | "live" | "failed";

type Token = { text: string; start_ms?: number; end_ms?: number; is_final?: boolean; speaker?: string; language?: string };

/** Максимальная длина одной реплики, после которой она закрывается принудительно. */
const MAX_UTTERANCE_MS = 25_000;
const TIMESLICE_MS = 120;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Потоковое распознавание через Soniox: браузер шлёт звук напрямую по WebSocket (временный ключ выдаёт сервер),
 * слова показываются по мере произнесения, законченные реплики сохраняются на сервере.
 */
export function useRealtimeStt(opts: {
  appointmentId: string;
  onUtterance: (u: LiveUtterance) => void;
  onRoles: (roles: Record<string, Speaker>) => void;
  onFailed: (reason: string) => void;
}) {
  const [status, setStatus] = useState<RealtimeStatus>("off");
  const [error, setError] = useState<string | null>(null);
  /** Текущая незаконченная реплика: подтверждённая часть + предварительная (может измениться). */
  const [live, setLive] = useState<{ speakerId: string | null; finalText: string; partialText: string } | null>(null);
  const [unsent, setUnsent] = useState(0);

  const cbRef = useRef(opts);
  cbRef.current = opts;
  const wsRef = useRef<WebSocket | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const pcmRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const sessionRef = useRef("");
  const t0Ref = useRef(0);
  const curRef = useRef<{ speakerId: string; language: string | null; text: string; startMs: number; endMs: number } | null>(null);
  const finishedRef = useRef<(() => void) | null>(null);
  const stoppingRef = useRef(false);
  const outboxRef = useRef<LiveUtterance[]>([]);
  const sendingRef = useRef(false);

  const flushOutbox = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    try {
      for (let attempt = 0; outboxRef.current.length && attempt < 4; attempt++) {
        const batch = outboxRef.current.slice(0, 50);
        try {
          const res = await fetch(`/api/appointments/${cbRef.current.appointmentId}/utterances`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: sessionRef.current, items: batch }),
          });
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as { roles: Record<string, Speaker> };
          outboxRef.current = outboxRef.current.filter((u) => !batch.includes(u));
          cbRef.current.onRoles(data.roles);
          attempt = -1; // успешная отправка — счётчик повторов сначала
        } catch {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
    } finally {
      sendingRef.current = false;
      setUnsent(outboxRef.current.length);
    }
  }, []);

  const closeUtterance = useCallback(() => {
    const cur = curRef.current;
    curRef.current = null;
    if (!cur || !cur.text.trim()) return;
    const u: LiveUtterance = {
      clientId: uid(),
      sessionId: sessionRef.current,
      speakerId: cur.speakerId,
      language: cur.language,
      text: cur.text.trim(),
      startAt: t0Ref.current + cur.startMs,
      endAt: t0Ref.current + cur.endMs,
    };
    outboxRef.current.push(u);
    setUnsent(outboxRef.current.length);
    cbRef.current.onUtterance(u);
    void flushOutbox();
  }, [flushOutbox]);

  const handleTokens = useCallback(
    (tokens: Token[]) => {
      let partial = "";
      let partialSpeaker: string | null = null;
      for (const t of tokens) {
        if (t.text === "<end>" || t.text === "<fin>") {
          if (t.is_final !== false) closeUtterance();
          continue;
        }
        if (!t.is_final) {
          partial += t.text;
          partialSpeaker ??= t.speaker ?? null;
          continue;
        }
        const speaker = t.speaker ?? curRef.current?.speakerId ?? "1";
        const start = t.start_ms ?? curRef.current?.endMs ?? 0;
        const end = t.end_ms ?? start;
        if (curRef.current && (curRef.current.speakerId !== speaker || end - curRef.current.startMs > MAX_UTTERANCE_MS)) closeUtterance();
        if (!curRef.current) {
          if (!t.text.trim()) continue; // не начинаем реплику с пробела
          curRef.current = { speakerId: speaker, language: t.language ?? null, text: "", startMs: start, endMs: end };
        }
        curRef.current.text += t.text;
        curRef.current.endMs = end;
      }
      const cur = curRef.current;
      setLive(cur || partial ? { speakerId: cur?.speakerId ?? partialSpeaker, finalText: cur?.text ?? "", partialText: partial } : null);
    },
    [closeUtterance],
  );

  const fail = useCallback((reason: string) => {
    if (stoppingRef.current) return;
    setStatus("failed");
    setError(reason);
    try {
      recRef.current?.state === "recording" && recRef.current.stop();
    } catch {}
    void pcmRef.current?.stop();
    pcmRef.current = null;
    wsRef.current?.close();
    cbRef.current.onFailed(reason);
  }, []);

  /** Подключение к Soniox; при неудаче возвращает false — запись продолжится в резервном режиме. */
  const start = useCallback(
    async (stream: MediaStream): Promise<boolean> => {
      stoppingRef.current = false;
      setError(null);
      setStatus("connecting");
      let session: { apiKey: string; wsUrl: string; config: Record<string, unknown> };
      try {
        const res = await fetch(`/api/appointments/${cbRef.current.appointmentId}/realtime`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
        session = data;
      } catch (err) {
        fail(`Не удалось получить доступ к Soniox: ${(err as Error).message}`);
        return false;
      }

      // Несжатый PCM 16 кГц — лучшее качество распознавания и одинаковое поведение на iPhone и ПК.
      const pcmSupported = typeof AudioWorkletNode !== "undefined";
      if (pcmSupported) session.config = { ...session.config, audio_format: "pcm_s16le", sample_rate: PCM_SAMPLE_RATE, num_channels: 1 };

      // Основной способ авторизации — ключ в подпротоколе; запасной — ключ в первом сообщении.
      const connect = (legacy: boolean) =>
        new Promise<WebSocket>((resolve, reject) => {
          const ws = legacy ? new WebSocket(session.wsUrl) : new WebSocket(session.wsUrl, ["soniox-api-key", session.apiKey]);
          const timer = setTimeout(() => {
            ws.close();
            reject(new Error("таймаут подключения"));
          }, 8000);
          ws.onopen = () => {
            clearTimeout(timer);
            ws.send(JSON.stringify(legacy ? { ...session.config, api_key: session.apiKey } : session.config));
            resolve(ws);
          };
          ws.onerror = () => {
            clearTimeout(timer);
            reject(new Error("ошибка соединения"));
          };
        });

      let ws: WebSocket;
      try {
        ws = await connect(false).catch(() => connect(true));
      } catch (err) {
        fail(`Soniox: ${(err as Error).message}`);
        return false;
      }
      wsRef.current = ws;
      sessionRef.current = uid().slice(0, 12);
      let gotMessage = false;

      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        let msg: { tokens?: Token[]; finished?: boolean; error_code?: number | string; error_message?: string };
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.error_code !== undefined || msg.error_message) {
          fail(`Soniox: ${msg.error_message ?? msg.error_code}`);
          return;
        }
        gotMessage = true;
        if (msg.tokens?.length) handleTokens(msg.tokens);
        if (msg.finished) {
          closeUtterance();
          finishedRef.current?.();
        }
      };
      ws.onclose = (ev) => {
        if (stoppingRef.current) {
          finishedRef.current?.();
          return;
        }
        fail(`соединение с Soniox прервано${gotMessage ? "" : ` (код ${ev.code})`}`);
      };

      t0Ref.current = Date.now();
      const pcm = pcmSupported
        ? await startPcm16k(stream, (chunk) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
          })
        : null;
      if (pcm) {
        pcmRef.current = pcm;
      } else {
        if (pcmSupported) {
          // AudioWorklet не запустился, а Soniox уже ждёт PCM — переподключаться долго, считаем режим недоступным.
          fail("не удалось запустить обработку звука в браузере");
          return false;
        }
        const opts = recorderOptions();
        const rec = new MediaRecorder(stream, opts?.mimeType ? opts : undefined);
        rec.ondataavailable = (e) => {
          if (e.data.size && ws.readyState === WebSocket.OPEN) ws.send(e.data);
        };
        rec.start(TIMESLICE_MS);
        recRef.current = rec;
      }
      setStatus("live");
      return true;
    },
    [closeUtterance, fail, handleTokens],
  );

  /** Завершение: досылаем звук, просим Soniox выдать остаток текста, сохраняем реплики. */
  const stop = useCallback(async () => {
    const ws = wsRef.current;
    const rec = recRef.current;
    stoppingRef.current = true;
    if (pcmRef.current) {
      await pcmRef.current.stop();
      pcmRef.current = null;
    }
    if (rec && rec.state !== "inactive") {
      await new Promise<void>((resolve) => {
        rec.addEventListener("stop", () => resolve(), { once: true });
        rec.stop();
      });
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      await new Promise<void>((resolve) => {
        finishedRef.current = resolve;
        ws.send(""); // пустое сообщение — конец аудио
        setTimeout(resolve, 6000);
      });
      ws.close();
    }
    finishedRef.current = null;
    closeUtterance();
    setLive(null);
    wsRef.current = null;
    recRef.current = null;
    for (let i = 0; i < 10 && outboxRef.current.length; i++) {
      await flushOutbox();
      if (outboxRef.current.length) await new Promise((r) => setTimeout(r, 1000));
    }
    setStatus((s) => (s === "failed" ? s : "off"));
    return outboxRef.current.length === 0;
  }, [closeUtterance, flushOutbox]);

  useEffect(
    () => () => {
      stoppingRef.current = true;
      wsRef.current?.close();
      if (recRef.current?.state === "recording") recRef.current.stop();
      void pcmRef.current?.stop();
    },
    [],
  );

  return { status, error, live, unsent, start, stop, retrySend: flushOutbox };
}
