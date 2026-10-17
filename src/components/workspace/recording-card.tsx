"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, fmtBytes, fmtDuration } from "@/lib/client";
import type { AppointmentDTO } from "@/lib/dto";
import { LANGUAGE_LABEL } from "@/lib/labels";
import { Square } from "lucide-react";
import { Alert, Badge, Button, Card, Select } from "../ui";
import { Preflight } from "./preflight";
import { useRealtimeStt, type LiveUtterance, type RealtimeStatus } from "./use-realtime-stt";
import { useSegmentRecorder, type UploadedSegment } from "./use-segment-recorder";
import type { Speaker } from "@/lib/types";

export type RealtimeLiveState = {
  status: RealtimeStatus;
  live: { speakerId: string | null; finalText: string; partialText: string } | null;
  sessionId: string | null;
};

const MAX_UPLOAD = 4 * 1024 * 1024;

export function RecordingCard({
  appt,
  onChange,
  onLiveSegment,
  onPendingChange,
  realtimeAvailable,
  onUtterance,
  onRoles,
  onRealtimeState,
  index,
}: {
  index?: string;
  appt: AppointmentDTO;
  onChange: () => Promise<void>;
  onLiveSegment: (s: UploadedSegment) => void;
  onPendingChange: (n: number) => void;
  realtimeAvailable: boolean;
  onUtterance: (u: LiveUtterance) => void;
  onRoles: (roles: Record<string, Speaker>) => void;
  onRealtimeState: (s: RealtimeLiveState) => void;
}) {
  const rec = useSegmentRecorder({ appointmentId: appt.id, onSegment: onLiveSegment });
  const sessionIdRef = useRef<string | null>(null);
  const rt = useRealtimeStt({
    appointmentId: appt.id,
    onUtterance: (u) => {
      sessionIdRef.current = u.sessionId;
      onUtterance(u);
    },
    onRoles,
    // Потоковое распознавание недоступно — дальше распознаём фрагменты через Whisper (Groq).
    onFailed: () => rec.setTranscribe(true),
  });
  useEffect(
    () => onRealtimeState({ status: rt.status, live: rt.live, sessionId: sessionIdRef.current }),
    [rt.status, rt.live, onRealtimeState],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "upload" | "manual" | "lang" | "stop">(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const consentOk = appt.consent?.status === "obtained";
  const hasConsentDecision = !!appt.consent;
  const recordingHere = rec.phase !== "idle";
  const interrupted = appt.status === "recording" && !recordingHere;
  const canStart = consentOk && ["draft", "review", "recording"].includes(appt.status) && !recordingHere;
  const failed = rec.queue.filter((q) => q.state === "failed");
  const inFlight = rec.queue.filter((q) => q.state !== "failed");
  useEffect(() => onPendingChange(inFlight.length), [inFlight.length, onPendingChange]);

  async function start() {
    setError(null);
    try {
      rec.setTranscribe(!realtimeAvailable);
      const started = await rec.start(async () => {
        const res = await apiFetch<{ nextSeq: number }>(`/api/appointments/${appt.id}/recording`, { method: "POST", json: { action: "start" } });
        return res.nextSeq;
      });
      if (started) {
        await onChange();
        const stream = rec.getStream();
        if (realtimeAvailable && stream && !(await rt.start(stream))) rec.setTranscribe(true);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function stop() {
    setError(null);
    setBusy("stop");
    try {
      if (rt.status === "live" || rt.status === "connecting") await rt.stop();
      if (recordingHere) await rec.stop();
      await apiFetch(`/api/appointments/${appt.id}/recording`, { method: "POST", json: { action: "stop" } });
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setError(null);
    if (file.size > MAX_UPLOAD) return setError("Файл больше 4 МБ. Для длинных приёмов используйте запись с микрофона.");
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("audio", file, file.name);
      form.append("source", "upload");
      await apiFetch(`/api/appointments/${appt.id}/segments`, { method: "POST", body: form });
      await onChange();
    } catch (err) {
      setError((err as Error).message);
      await onChange();
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function manual() {
    setBusy("manual");
    setError(null);
    try {
      await apiFetch(`/api/appointments/${appt.id}/transcript`, { method: "POST" });
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function setLanguage(language: string) {
    setBusy("lang");
    try {
      await apiFetch(`/api/appointments/${appt.id}`, { method: "PATCH", json: { language } });
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!["draft", "recording", "processing", "review"].includes(appt.status)) return null;

  return (
    <Card
      index={index}
      title="Запись приёма"
      actions={
        appt.recording && !recordingHere ? (
          <span className="text-sm text-ink-3">
            Записано: {fmtDuration(appt.recording.durationSeconds)} · фрагментов: {appt.recording.segmentsCount} ·{" "}
            {fmtBytes(appt.recording.totalBytes)}
          </span>
        ) : null
      }
    >
      <div className="space-y-4">
        {consentOk && appt.status !== "processing" && (
          <Preflight phase={rec.phase} level={rec.level} queue={rec.queue} segments={appt.segments} realtimeStatus={realtimeAvailable ? rt.status : null} />
        )}
        {!hasConsentDecision && <Alert tone="yellow">Перед записью зафиксируйте согласие пациента.</Alert>}

        {interrupted && (
          <Alert tone="yellow">
            Запись была прервана (страница перезагружена или закрыта). Уже отправленные фрагменты сохранены. Продолжите запись или завершите её.
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {appt.status === "draft" && (
            <label className="flex items-center gap-2 text-sm">
              Язык речи:
              <Select className="w-auto" value={appt.language} disabled={busy === "lang"} onChange={(e) => setLanguage(e.target.value)}>
                {Object.entries(LANGUAGE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </label>
          )}

          {!recordingHere ? (
            canStart && (
              <Button onClick={start} loading={rec.phase === "starting"}>
                <span className="h-2 w-2 bg-signal" />
                {appt.status === "recording" ? "Продолжить запись" : appt.status === "review" ? "Дозаписать" : "Начать запись"}
              </Button>
            )
          ) : (
            <Button variant="danger" onClick={stop} loading={rec.phase === "stopping" || busy === "stop"} disabled={rec.phase === "starting"}>
              <Square className="h-3.5 w-3.5 fill-current" /> Завершить запись
            </Button>
          )}
          {interrupted && (
            <Button variant="secondary" onClick={stop} loading={busy === "stop"}>
              Завершить запись
            </Button>
          )}

          {recordingHere && (
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1.5 font-mono font-medium text-signal tabular">
                <span className="h-2.5 w-2.5 animate-pulse bg-signal" />
                {fmtDuration(rec.elapsed)}
              </span>
              <span className="h-2 w-32 overflow-hidden border border-line-2 bg-sheet" title="Уровень сигнала микрофона">
                <span className="block h-full bg-ink transition-[width] duration-100" style={{ width: `${Math.round(rec.level * 100)}%` }} />
              </span>
              {rt.status === "live" && (
                <Badge tone="violet" title="Слова появляются по мере речи (Soniox)">
                  распознавание в реальном времени
                </Badge>
              )}
              {rt.status === "connecting" && <span className="text-xs text-ink-3">подключение к Soniox…</span>}
              {rt.status !== "live" && rec.latency !== null && (
                <span className={rec.latency > 5 ? "text-[#7a5410]" : "text-ink-3"} title="Время от конца фразы до появления текста">
                  задержка текста ~{rec.latency.toFixed(1)} с
                </span>
              )}
              {inFlight.length > 0 && (
                <span className="text-ink-3">
                  отправка фрагментов: {inFlight.length} ({fmtBytes(inFlight.reduce((s, q) => s + q.blob.size, 0))})
                </span>
              )}
            </div>
          )}
        </div>

        {rec.error && <Alert>{rec.error}</Alert>}
        {rt.status === "failed" && recordingHere && (
          <Alert tone="yellow">
            Мгновенное распознавание недоступно ({rt.error}). Запись продолжается, текст распознаётся по фразам через резервный сервис.
          </Alert>
        )}
        {rt.unsent > 0 && !recordingHere && (
          <Alert tone="yellow">
            Не сохранено реплик: {rt.unsent}. Не закрывайте страницу.{" "}
            <button className="font-medium underline" onClick={() => void rt.retrySend()}>
              Повторить
            </button>
          </Alert>
        )}
        {failed.length > 0 && (
          <Alert tone="yellow">
            Не удалось отправить фрагментов: {failed.length} ({failed[0].error}). Аудио хранится в браузере — не закрывайте страницу.{" "}
            <button className="font-medium underline" onClick={rec.retryFailed}>
              Повторить отправку
            </button>
          </Alert>
        )}

        {appt.status === "draft" && hasConsentDecision && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm">
            <span className="text-ink-3">Другие способы:</span>
            {consentOk && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="audio/*,.webm,.ogg,.mp3,.m4a,.wav"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                />
                <Button variant="secondary" size="sm" loading={busy === "upload"} onClick={() => fileRef.current?.click()}>
                  Загрузить аудиофайл (до 4 МБ)
                </Button>
              </>
            )}
            <Button variant="secondary" size="sm" loading={busy === "manual"} onClick={manual}>
              Ввести текст вручную
            </Button>
          </div>
        )}

        {appt.status === "processing" && <Alert tone="blue">Идёт распознавание оставшихся фрагментов…</Alert>}
        {error && <Alert>{error}</Alert>}
        <p className="text-xs text-ink-3">
          {realtimeAvailable
            ? "Слова появляются по мере речи (Soniox). Голоса разделяются по звуку, роли «Врач» / «Пациент» определяются автоматически и исправляются при проверке. Если Soniox недоступен, запись продолжается с распознаванием по фразам."
            : "Текст появляется после каждой фразы — запись нарезается по паузам в речи (фрагменты 3–12 с). Реплики автоматически размечаются «Врач» / «Пациент»; разметку можно исправить при проверке."}{" "}
          Качество зависит от сети, микрофона и акустики.
        </p>
      </div>
    </Card>
  );
}
