"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client";
import type { SegmentDTO } from "@/lib/dto";
import { cx } from "../ui";
import type { Phase, QueueItem } from "./use-segment-recorder";
import type { RealtimeStatus } from "./use-realtime-stt";

type Light = "green" | "yellow" | "red" | "gray";

const DOT: Record<Light, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
  gray: "bg-slate-300",
};
const BOX: Record<Light, string> = {
  green: "border-emerald-200 bg-emerald-50/60",
  yellow: "border-amber-200 bg-amber-50/70",
  red: "border-red-200 bg-red-50/70",
  gray: "border-slate-200 bg-slate-50",
};

function Indicator({ title, light, status, detail, action }: { title: string; light: Light; status: string; detail?: string; action?: React.ReactNode }) {
  return (
    <div className={cx("flex min-w-0 flex-1 items-start gap-3 rounded-lg border px-3 py-2.5", BOX[light])}>
      <span className={cx("mt-1 h-3 w-3 shrink-0 rounded-full", DOT[light], light !== "gray" && "shadow-[0_0_0_3px_rgba(255,255,255,0.8)]")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">{title}</span>
          {action}
        </div>
        <div className="text-sm font-medium text-slate-900">{status}</div>
        {detail && <div className="text-xs text-slate-600">{detail}</div>}
      </div>
    </div>
  );
}

const SmallButton = ({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
  <button type="button" onClick={onClick} disabled={disabled} className="text-xs font-medium text-brand-700 hover:underline disabled:text-slate-400 disabled:no-underline">
    {children}
  </button>
);

/* ---------------- Интернет: пинг до сервера ---------------- */

const PING_EVERY_MS = 5000;
const PING_WINDOW = 6;

function useConnection() {
  const [samples, setSamples] = useState<(number | null)[]>([]);
  const [online, setOnline] = useState(true);

  const ping = useCallback(async () => {
    const started = performance.now();
    let rtt: number | null = null;
    try {
      const res = await fetch(`/api/health?_=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
      if (res.ok) rtt = Math.round(performance.now() - started);
    } catch {}
    setSamples((prev) => [...prev, rtt].slice(-PING_WINDOW));
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => {
      setOnline(true);
      void ping();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    void ping();
    const t = setInterval(ping, PING_EVERY_MS);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [ping]);

  const ok = samples.filter((s): s is number => s !== null);
  const lost = samples.length - ok.length;
  const last = samples.at(-1);
  const avg = ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length) : null;
  return { online, samples, avg, lost, last };
}

/* ---------------- Микрофон ---------------- */

type MicState =
  | { kind: "unknown" }
  | { kind: "checking" }
  | { kind: "tested"; peak: number }
  | { kind: "denied" }
  | { kind: "notfound" }
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

/** Порог «есть голос» для теста микрофона (RMS). */
const VOICE_RMS = 0.01;

async function testMicrophone(durationMs = 3000): Promise<MicState> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return { kind: "unsupported" };
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (err) {
    const name = (err as DOMException).name;
    if (name === "NotAllowedError" || name === "SecurityError") return { kind: "denied" };
    if (name === "NotFoundError" || name === "OverconstrainedError") return { kind: "notfound" };
    return { kind: "error", message: (err as Error).message };
  }
  const ctx = new AudioContext();
  try {
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let peak = 0;
    const until = Date.now() + durationMs;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 100));
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      peak = Math.max(peak, Math.sqrt(sum / buf.length));
    }
    return { kind: "tested", peak };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => {});
  }
}

/* ---------------- Сервис распознавания ---------------- */

type ProviderCheck = {
  ok: boolean;
  latencyMs: number | null;
  sttModel: string;
  llmModel: string;
  sttAvailable: boolean | null;
  llmAvailable: boolean | null;
  error: string | null;
  realtime: { ok: boolean; latencyMs: number; error: string | null; model: string } | null;
};

/* ---------------- Панель ---------------- */

export function Preflight({
  phase,
  level,
  queue,
  segments,
  realtimeStatus = null,
}: {
  phase: Phase;
  level: number;
  queue: QueueItem[];
  segments: SegmentDTO[];
  /** Состояние потокового распознавания (Soniox) или null, если оно не настроено. */
  realtimeStatus?: RealtimeStatus | null;
}) {
  const net = useConnection();
  const [mic, setMic] = useState<MicState>({ kind: "unknown" });
  const [stt, setStt] = useState<ProviderCheck | null>(null);
  const [sttLoading, setSttLoading] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);
  const lastVoiceRef = useRef(0);
  const [, force] = useState(0);
  const recording = phase === "recording";

  const runMicTest = useCallback(async () => {
    setMic({ kind: "checking" });
    setMic(await testMicrophone());
  }, []);

  const runSttCheck = useCallback(async () => {
    setSttLoading(true);
    setSttError(null);
    try {
      setStt(await apiFetch<ProviderCheck>("/api/health/stt"));
    } catch (err) {
      setSttError((err as Error).message);
    } finally {
      setSttLoading(false);
    }
  }, []);

  // При открытии: проверяем сервис; микрофон — автоматически, только если доступ уже разрешён (без запроса разрешения).
  useEffect(() => {
    void runSttCheck();
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((p) => {
        if (p.state === "denied") setMic({ kind: "denied" });
        else if (p.state === "granted") void runMicTest();
      })
      .catch(() => {});
  }, [runSttCheck, runMicTest]);

  // Во время записи следим за сигналом: когда в последний раз был слышен голос.
  useEffect(() => {
    if (!recording) return;
    lastVoiceRef.current = Date.now();
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => {
    if (recording && level > VOICE_RMS * 8) lastVoiceRef.current = Date.now();
  }, [recording, level]);

  /* --- микрофон --- */
  let micLight: Light = "gray";
  let micStatus = "Не проверен";
  let micDetail: string | undefined = "Нажмите «Проверить» и скажите несколько слов";
  if (recording) {
    const silentFor = Math.round((Date.now() - lastVoiceRef.current) / 1000);
    if (silentFor >= 10) {
      micLight = "yellow";
      micStatus = "Нет сигнала";
      micDetail = `Голос не слышен ${silentFor} с — проверьте микрофон`;
    } else {
      micLight = "green";
      micStatus = "Идёт запись";
      micDetail = "Сигнал есть";
    }
  } else if (mic.kind === "checking") {
    micStatus = "Проверка… говорите";
    micDetail = "Слушаем 3 секунды";
  } else if (mic.kind === "tested") {
    if (mic.peak >= VOICE_RMS) {
      micLight = "green";
      micStatus = "Работает";
      micDetail = `Уровень сигнала ${Math.min(100, Math.round(mic.peak * 800))}%`;
    } else {
      micLight = "yellow";
      micStatus = "Слабый сигнал";
      micDetail = "Голос почти не слышен — поднесите микрофон ближе или проверьте громкость";
    }
  } else if (mic.kind === "denied") {
    micLight = "red";
    micStatus = "Доступ запрещён";
    micDetail = "Разрешите микрофон в настройках браузера (значок замка в адресной строке)";
  } else if (mic.kind === "notfound") {
    micLight = "red";
    micStatus = "Микрофон не найден";
    micDetail = "Подключите микрофон";
  } else if (mic.kind === "unsupported") {
    micLight = "red";
    micStatus = "Браузер не поддерживает запись";
    micDetail = "Используйте актуальный Chrome, Edge, Firefox или Safari";
  } else if (mic.kind === "error") {
    micLight = "red";
    micStatus = "Ошибка микрофона";
    micDetail = mic.message;
  }

  /* --- интернет --- */
  const failedUploads = queue.filter((q) => q.state === "failed").length;
  const pendingUploads = queue.filter((q) => q.state !== "failed").length;
  let netLight: Light = "gray";
  let netStatus = "Проверка…";
  let netDetail: string | undefined;
  const lastTwoLost = net.samples.length >= 2 && net.samples.slice(-2).every((s) => s === null);
  if (!net.online || lastTwoLost) {
    netLight = "red";
    netStatus = "Нет соединения";
    netDetail = "Аудио сохраняется в браузере и отправится, когда связь восстановится";
  } else if (net.samples.length) {
    const ping = net.last ?? net.avg;
    netStatus = ping !== null && ping !== undefined ? `Пинг ${ping} мс` : "Потеря пакетов";
    const parts = [net.avg !== null ? `среднее ${net.avg} мс` : null, net.lost ? `потеряно ${net.lost} из ${net.samples.length}` : null];
    if (failedUploads) parts.push(`не отправлено фрагментов: ${failedUploads}`);
    else if (pendingUploads > 1) parts.push(`в очереди: ${pendingUploads}`);
    netDetail = parts.filter(Boolean).join(" · ");
    if (failedUploads || net.lost >= 2 || (net.avg ?? 0) > 800) netLight = "red";
    else if (net.lost || (net.avg ?? 0) > 300 || pendingUploads > 2) netLight = "yellow";
    else netLight = "green";
    if (netLight === "yellow") netDetail = `${netDetail ? `${netDetail} · ` : ""}связь нестабильная`;
  }

  /* --- распознавание --- */
  const recent = segments.slice(-3);
  const recentFailed = recent.filter((s) => s.status === "failed").length;
  const lastSeg = segments.at(-1);
  let sttLight: Light = "gray";
  let sttStatus = "Проверка…";
  let sttDetail: string | undefined;
  if (sttError) {
    sttLight = "red";
    sttStatus = "Не удалось проверить";
    sttDetail = sttError;
  } else if (stt) {
    if (!stt.ok) {
      sttLight = "red";
      sttStatus = "Сервис недоступен";
      sttDetail = stt.error ?? undefined;
    } else {
      sttLight = (stt.latencyMs ?? 0) > 3000 ? "yellow" : "green";
      sttStatus = sttLight === "green" ? "Доступно" : "Сервис отвечает медленно";
      sttDetail = `${stt.sttModel} · ответ ${stt.latencyMs} мс`;
    }
  }
  // Потоковое распознавание (Soniox) — основной режим; Groq — резервный.
  if (stt?.realtime && !sttError) {
    if (stt.realtime.ok) {
      sttLight = stt.ok ? "green" : "yellow";
      sttStatus = "Мгновенное (Soniox)";
      sttDetail = `${stt.realtime.model} · ответ ${stt.realtime.latencyMs} мс${stt.ok ? " · резерв Groq готов" : " · резерв Groq недоступен"}`;
    } else {
      sttLight = stt.ok ? "yellow" : "red";
      sttStatus = stt.ok ? "Soniox недоступен — резерв Groq" : "Сервисы недоступны";
      sttDetail = stt.realtime.error ?? undefined;
    }
  }
  if (realtimeStatus === "live") {
    sttLight = "green";
    sttStatus = "Мгновенное распознавание";
    sttDetail = "Soniox · слова появляются по мере речи";
  } else if (realtimeStatus === "connecting") {
    sttLight = "gray";
    sttStatus = "Подключение к Soniox…";
  } else if (realtimeStatus === "failed" && (recording || phase === "stopping")) {
    sttLight = "yellow";
    sttStatus = "Резервный режим (Groq)";
    sttDetail = "Soniox недоступен — текст появляется после каждой фразы";
  }
  if (segments.length && (recording || phase === "stopping") && realtimeStatus !== "live") {
    if (recentFailed >= 2) {
      sttLight = "red";
      sttStatus = "Фрагменты не распознаются";
      sttDetail = lastSeg?.error ?? undefined;
    } else if (lastSeg?.status === "failed") {
      sttLight = "yellow";
      sttStatus = "Сбой распознавания";
      sttDetail = `${lastSeg.error ?? ""} — фрагмент сохранён, можно распознать повторно`;
    } else if (lastSeg?.status === "done" && sttLight !== "red") {
      const done = segments.filter((s) => s.status === "done" && s.textSource !== "realtime").length;
      if (realtimeStatus === "failed") {
        sttLight = "yellow";
        sttStatus = "Резервный режим (Groq)";
        sttDetail = `Soniox недоступен · распознано по фразам: ${done}`;
      } else {
        sttLight = "green";
        sttStatus = "Работает";
        sttDetail = `распознано фрагментов: ${done}`;
      }
    }
  }

  const lights = [micLight, netLight, sttLight];
  const overall: Light = lights.includes("red") ? "red" : lights.includes("yellow") ? "yellow" : lights.includes("gray") ? "gray" : "green";
  const summary =
    overall === "green"
      ? recording
        ? "Запись идёт, всё в порядке"
        : "Всё готово к записи"
      : overall === "red"
        ? recording
          ? "Есть проблема — проверьте индикаторы"
          : "Есть проблема — запись может не получиться"
        : overall === "yellow"
          ? recording
            ? "Запись идёт, есть замечания"
            : "Можно записывать, но есть замечания"
          : "Проверка оборудования";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className={cx("h-2.5 w-2.5 rounded-full", DOT[overall])} />
        <span className="font-medium text-slate-800">{summary}</span>
      </div>
      <div className="flex flex-col gap-2 md:flex-row">
        <Indicator
          title="Микрофон"
          light={micLight}
          status={micStatus}
          detail={micDetail}
          action={
            !recording && (
              <SmallButton onClick={runMicTest} disabled={mic.kind === "checking" || phase !== "idle"}>
                Проверить
              </SmallButton>
            )
          }
        />
        <Indicator title="Интернет" light={netLight} status={netStatus} detail={netDetail} />
        <Indicator
          title="Распознавание речи"
          light={sttLight}
          status={sttStatus}
          detail={sttDetail}
          action={
            <SmallButton onClick={runSttCheck} disabled={sttLoading}>
              {sttLoading ? "…" : "Проверить"}
            </SmallButton>
          }
        />
      </div>
    </div>
  );
}
