"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, fmtDate, fmtDateTime } from "@/lib/client";
import type { AppointmentDTO, TemplateDTO } from "@/lib/dto";
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

  // Живое обновление транскрипции по мере распознавания фрагментов.
  const onLiveSegment = useCallback((s: UploadedSegment) => {
    setAppt((prev) => {
      const segments = prev.segments.filter((x) => x.id !== s.id);
      segments.push({ ...s, source: "microphone", durationSeconds: 0, stale: false });
      segments.sort((a, b) => a.seq - b.seq);
      return { ...prev, segments };
    });
  }, []);

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
      {appt.consent && <RecordingCard appt={appt} onChange={refresh} onLiveSegment={onLiveSegment} />}
      <TranscriptCard appt={appt} onChange={refresh} />
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
