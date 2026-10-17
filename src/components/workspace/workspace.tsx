"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, fmtDate, fmtDateTime } from "@/lib/client";
import type { AppointmentDTO, SegmentDTO, TemplateDTO } from "@/lib/dto";
import { AppointmentStatusBadge } from "../status";
import { Alert, Badge, Button } from "../ui";
import { ChevronLeft } from "lucide-react";
import { ConsentCard } from "./consent-card";
import { DocumentsCard } from "./documents-card";
import { RecordingCard } from "./recording-card";
import { Stepper } from "./stepper";
import { TranscriptCard } from "./transcript-card";
import type { UploadedSegment } from "./use-segment-recorder";
import type { LiveUtterance } from "./use-realtime-stt";
import type { RealtimeLiveState } from "./recording-card";
import type { Speaker } from "@/lib/types";

export function Workspace({
  initial,
  templates,
  realtimeAvailable = false,
  defaultTemplateId = null,
}: {
  initial: AppointmentDTO;
  templates: TemplateDTO[];
  realtimeAvailable?: boolean;
  defaultTemplateId?: string | null;
}) {
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
  const [realtime, setRealtime] = useState<RealtimeLiveState | null>(null);
  const onUtterance = useCallback((u: LiveUtterance) => {
    setAppt((prev) => ({
      ...prev,
      utterances: [
        ...prev.utterances,
        { id: u.clientId, clientId: u.clientId, sessionId: u.sessionId, speakerId: u.speakerId, text: u.text, startAt: new Date(u.startAt).toISOString() },
      ],
    }));
  }, []);
  const onRoles = useCallback((roles: Record<string, Speaker>) => setAppt((prev) => ({ ...prev, speakerRoles: { ...prev.speakerRoles, ...roles } })), []);

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

  const consentLabel =
    appt.consent?.status === "obtained" ? (
      <Badge tone="green">Получено</Badge>
    ) : appt.consent?.status === "declined" ? (
      <Badge tone="red">Отказ</Badge>
    ) : (
      <Badge tone="yellow">Не зафиксировано</Badge>
    );

  return (
    <div>
      <div className="mb-6 border-b border-line pb-4">
        <Link
          href={appt.status === "archived" ? "/archive" : "/appointments"}
          className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" /> {appt.status === "archived" ? "Архив" : "Приёмы"}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{appt.patient.fullName}</h1>
          <AppointmentStatusBadge status={appt.status} />
        </div>
        {appt.reason && <p className="mt-1 text-sm text-ink-2">{appt.reason}</p>}
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-5">
          {(!appt.consent || (appt.status === "draft" && appt.consent.status !== "obtained")) && <ConsentCard appt={appt} onChange={refresh} />}
          {appt.consent && (
            <RecordingCard
              appt={appt}
              onChange={refresh}
              onLiveSegment={onLiveSegment}
              onPendingChange={setPendingUploads}
              realtimeAvailable={realtimeAvailable}
              onUtterance={onUtterance}
              onRoles={onRoles}
              onRealtimeState={setRealtime}
            />
          )}
          <TranscriptCard appt={appt} onChange={refresh} pendingUploads={pendingUploads} realtime={realtime} />
          <DocumentsCard appt={appt} templates={templates} defaultTemplateId={defaultTemplateId} onChange={refresh} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="rounded-md border border-line bg-white">
            <dl className="divide-y divide-line text-[13px]">
              {[
                ["Дата рождения", appt.patient.dateOfBirth ? fmtDate(appt.patient.dateOfBirth) : null],
                ["ID пациента", appt.patient.externalPatientId],
                ["Врач", appt.doctorName],
                ["Создан", fmtDateTime(appt.createdAt)],
                ["Начало", appt.startedAt ? fmtDateTime(appt.startedAt) : null],
                ["Окончание", appt.endedAt ? fmtDateTime(appt.endedAt) : null],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 px-4 py-2">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="text-right text-ink">{v}</dd>
                  </div>
                ))}
              <div className="flex items-center justify-between gap-3 px-4 py-2">
                <dt className="text-ink-3">Согласие</dt>
                <dd>{consentLabel}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-md border border-line bg-white px-4 py-4">
            <p className="mb-3 text-[13px] font-medium text-ink">Ход приёма</p>
            <Stepper appt={appt} />
          </div>

          {appt.status === "review" && (
            <div className="rounded-md border border-line bg-white px-4 py-4">
              <p className="text-[13px] font-medium">Завершение</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
                {allApproved ? "Все документы подтверждены — приём можно завершить." : "Сформируйте документы и подтвердите каждый из них."}
              </p>
              <Button className="mt-3 w-full" onClick={() => changeStatus("complete")} disabled={!allApproved} loading={busy === "complete"}>
                Сохранить и завершить приём
              </Button>
            </div>
          )}
          {appt.status === "completed" && (
            <div className="rounded-md border border-line bg-white px-4 py-4">
              <p className="text-[13px] font-medium">Приём завершён</p>
              <p className="mt-1 text-[13px] text-ink-3">Переведите его в архив или верните на проверку.</p>
              <div className="mt-3 flex flex-col gap-2">
                <Button onClick={() => changeStatus("archive")} loading={busy === "archive"}>
                  Перевести в архив
                </Button>
                <Button variant="secondary" onClick={() => changeStatus("reopen")} loading={busy === "reopen"}>
                  Вернуть на проверку
                </Button>
              </div>
            </div>
          )}
          {appt.status === "archived" && <Alert tone="blue">В архиве с {fmtDateTime(appt.archivedAt)}. Только просмотр.</Alert>}
        </aside>
      </div>
    </div>
  );
}
