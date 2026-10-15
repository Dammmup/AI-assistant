"use client";

import { useRef, useState } from "react";
import { apiFetch, fmtDuration } from "@/lib/client";
import type { AppointmentDTO } from "@/lib/dto";
import { LANGUAGE_LABEL } from "@/lib/labels";
import { Alert, Button, Card, Select } from "../ui";
import { useSegmentRecorder, type UploadedSegment } from "./use-segment-recorder";

const MAX_UPLOAD = 4 * 1024 * 1024;

export function RecordingCard({
  appt,
  onChange,
  onLiveSegment,
}: {
  appt: AppointmentDTO;
  onChange: () => Promise<void>;
  onLiveSegment: (s: UploadedSegment) => void;
}) {
  const rec = useSegmentRecorder({ appointmentId: appt.id, onSegment: onLiveSegment });
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

  async function start() {
    setError(null);
    try {
      const started = await rec.start(async () => {
        const res = await apiFetch<{ nextSeq: number }>(`/api/appointments/${appt.id}/recording`, { method: "POST", json: { action: "start" } });
        return res.nextSeq;
      });
      if (started) await onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function stop() {
    setError(null);
    setBusy("stop");
    try {
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
      title="Запись приёма"
      actions={
        appt.recording && !recordingHere ? (
          <span className="text-sm text-slate-500">
            Записано: {fmtDuration(appt.recording.durationSeconds)} · фрагментов: {appt.recording.segmentsCount}
          </span>
        ) : null
      }
    >
      <div className="space-y-4">
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
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                {appt.status === "recording" ? "Продолжить запись" : appt.status === "review" ? "Дозаписать" : "Начать запись"}
              </Button>
            )
          ) : (
            <Button variant="danger" onClick={stop} loading={rec.phase === "stopping" || busy === "stop"} disabled={rec.phase === "starting"}>
              ■ Завершить запись
            </Button>
          )}
          {interrupted && (
            <Button variant="secondary" onClick={stop} loading={busy === "stop"}>
              Завершить запись
            </Button>
          )}

          {recordingHere && (
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-red-600">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
                {fmtDuration(rec.elapsed)}
              </span>
              <span className="h-2 w-28 overflow-hidden rounded-full bg-slate-200" title="Уровень сигнала микрофона">
                <span className="block h-full bg-emerald-500 transition-[width] duration-100" style={{ width: `${Math.round(rec.level * 100)}%` }} />
              </span>
              {inFlight.length > 0 && <span className="text-slate-500">отправка фрагментов: {inFlight.length}</span>}
            </div>
          )}
        </div>

        {rec.error && <Alert>{rec.error}</Alert>}
        {failed.length > 0 && (
          <Alert tone="yellow">
            Не удалось отправить фрагментов: {failed.length} ({failed[0].error}). Аудио хранится в браузере — не закрывайте страницу.{" "}
            <button className="font-medium underline" onClick={rec.retryFailed}>
              Повторить отправку
            </button>
          </Alert>
        )}

        {appt.status === "draft" && hasConsentDecision && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-sm">
            <span className="text-slate-500">Другие способы:</span>
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
        <p className="text-xs text-slate-500">
          Текст появляется фрагментами примерно каждые 15 секунд. Фактическая задержка и качество распознавания зависят от сети, микрофона и
          акустических условий.
        </p>
      </div>
    </Card>
  );
}
