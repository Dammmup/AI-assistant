"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, fmtDate, fmtDateTime } from "@/lib/client";
import type { AppointmentDTO, SegmentDTO, TemplateDTO } from "@/lib/dto";
import { AppointmentStatusBadge } from "../status";
import { Alert, Button, Card } from "../ui";
import { ConsentCard } from "./consent-card";
import { DocumentsCard } from "./documents-card";
import { RecordingCard } from "./recording-card";
import { Stepper } from "./stepper";
import { TranscriptCard } from "./transcript-card";
import type { UploadedSegment } from "./use-segment-recorder";

export function Workspace({ initial, templates }: { initial: AppointmentDTO; templates: TemplateDTO[] }) {
  const [appt, setAppt] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | string>(null);

  const refresh = useCallback(async () => {
    try {
      setAppt(await apiFetch<AppointmentDTO>(`/api/appointments/${initial.id}`));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [initial.id]);

  // Пока идёт обработка на сервере — периодически обновляем состояние.
  const polling = appt.status === "processing" || appt.transcript?.status === "in_progress" && appt.status !== "recording";
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [polling, refresh]);

  // Разметка «врач / пациент» во время записи: не чаще раза в 6 с, без параллельных запросов.
  const diarizeRef = useRef({ inFlight: false, again: false, last: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined });
  const runDiarize = useCallback(async () => {
    const d = diarizeRef.current;
    if (d.inFlight) {
      d.again = true;
      return;
    }
    const wait = 6000 - (Date.now() - d.last);
    if (wait > 0) {
      clearTimeout(d.timer);
      d.timer = setTimeout(runDiarize, wait);
      return;
    }
    d.inFlight = true;
    d.last = Date.now();
    try {
      const labels = await apiFetch<{ id: string; units: string[]; speakers: SegmentDTO["speakers"] }[]>(`/api/appointments/${initial.id}/diarize`, {
        method: "POST",
      });
      const byId = new Map(labels.map((l) => [l.id, l]));
      setAppt((prev) => ({
        ...prev,
        segments: prev.segments.map((sg) => {
          const l = byId.get(sg.id);
          return l?.speakers ? { ...sg, units: l.units, speakers: l.speakers } : sg;
        }),
      }));
    } catch {
      // Разметка вторична: при ошибке текст остаётся без меток, при завершении записи она повторится на сервере.
    } finally {
      d.inFlight = false;
      if (d.again) {
        d.again = false;
        void runDiarize();
      }
    }
  }, [initial.id]);
  useEffect(() => () => clearTimeout(diarizeRef.current.timer), []);

  // Живое обновление транскрипции по мере распознавания фрагментов.
  const onLiveSegment = useCallback(
    (s: UploadedSegment) => {
      setAppt((prev) => {
        const segments = prev.segments.filter((x) => x.id !== s.id);
        segments.push({ ...s, source: "microphone", stale: false });
        segments.sort((a, b) => a.seq - b.seq);
        return { ...prev, segments };
      });
      if (s.status === "done" && s.units.length && !s.speakers) void runDiarize();
    },
    [runDiarize],
  );
  const [pendingUploads, setPendingUploads] = useState(0);

  async function changeStatus(action: "complete" | "reopen" | "archive") {
    setBusy(action);
    setError(null);
    try {
      await apiFetch(`/api/appointments/${appt.id}/status`, { method: "POST", json: { action } });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const allApproved = appt.documents.length > 0 && appt.documents.every((d) => d.status === "approved");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={appt.status === "archived" ? "/archive" : "/appointments"} className="text-sm text-slate-500 hover:underline">
            ← {appt.status === "archived" ? "Архив" : "Приёмы"}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{appt.patient.fullName}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {appt.patient.dateOfBirth && <>Дата рождения: {fmtDate(appt.patient.dateOfBirth)} · </>}
            {appt.patient.externalPatientId && <>ID: {appt.patient.externalPatientId} · </>}
            Врач: {appt.doctorName} · Создан: {fmtDateTime(appt.createdAt)}
            {appt.startedAt && <> · Начало: {fmtDateTime(appt.startedAt)}</>}
            {appt.endedAt && <> · Окончание: {fmtDateTime(appt.endedAt)}</>}
          </p>
          {appt.reason && <p className="mt-1 text-sm text-slate-600">Повод обращения: {appt.reason}</p>}
        </div>
        <AppointmentStatusBadge status={appt.status} />
      </div>

      <Stepper appt={appt} />

      {error && <Alert>{error}</Alert>}

      <ConsentCard appt={appt} onChange={refresh} />
      {appt.consent && <RecordingCard appt={appt} onChange={refresh} onLiveSegment={onLiveSegment} onPendingChange={setPendingUploads} />}
      <TranscriptCard appt={appt} onChange={refresh} pendingUploads={pendingUploads} />
      <DocumentsCard appt={appt} templates={templates} onChange={refresh} />

      {appt.status === "review" && (
        <Card title="Завершение приёма">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => changeStatus("complete")} disabled={!allApproved} loading={busy === "complete"}>
              Сохранить и завершить приём
            </Button>
            {!allApproved && <span className="text-sm text-slate-500">Сформируйте документы и подтвердите каждый из них.</span>}
          </div>
        </Card>
      )}
      {appt.status === "completed" && (
        <Card title="Приём завершён">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => changeStatus("archive")} loading={busy === "archive"}>
              Перевести в архив
            </Button>
            <Button variant="secondary" onClick={() => changeStatus("reopen")} loading={busy === "reopen"}>
              Вернуть на проверку
            </Button>
          </div>
        </Card>
      )}
      {appt.status === "archived" && <Alert tone="blue">Приём находится в архиве с {fmtDateTime(appt.archivedAt)}. Данные доступны только для просмотра.</Alert>}
    </div>
  );
}
