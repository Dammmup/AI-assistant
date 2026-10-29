"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, fmtDate, fmtDateTime } from "@/lib/client";
import { ageOn, formatAge } from "@/lib/patient-validation";
import type { AppointmentDTO, SegmentDTO, TemplateDTO } from "@/lib/dto";
import { AppointmentStatusBadge } from "../status";
import { Alert, Badge, Button } from "../ui";
import { ChevronLeft } from "lucide-react";
import { ConsentCard } from "./consent-card";
import { DocumentsCard } from "./documents-card";
import { RecordingCard } from "./recording-card";
import { Stepper } from "./stepper";
import { TranscriptCard } from "./transcript-card";
import { LockedNotice } from "../paywall";
import type { UploadedSegment } from "./use-segment-recorder";
import type { LiveUtterance } from "./use-realtime-stt";
import type { RealtimeLiveState } from "./recording-card";
import type { Speaker } from "@/lib/types";

export function Workspace({
  initial,
  templates,
  realtimeAvailable = false,
  defaultTemplateId = null,
  locked = false,
}: {
  initial: AppointmentDTO;
  templates: TemplateDTO[];
  realtimeAvailable?: boolean;
  defaultTemplateId?: string | null;
  locked?: boolean;
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

  // Нумерация разделов бланка
  const showConsent = !appt.consent || (appt.status === "draft" && appt.consent.status !== "obtained");
  const showRecording = !!appt.consent && ["draft", "recording", "processing", "review"].includes(appt.status);
  const showTranscript = !!appt.transcript || appt.segments.length > 0;
  const showDocs = ["review", "completed", "archived"].includes(appt.status);
  let n = 0;
  const num = (show: boolean) => (show ? String(++n).padStart(2, "0") : undefined);
  const idx = { consent: num(showConsent), recording: num(showRecording), transcript: num(showTranscript), docs: num(showDocs) };
  const age = appt.patient.dateOfBirth ? formatAge(ageOn(appt.patient.dateOfBirth)) : null;

  return (
    <div>
      <div className="mb-10 border-b border-ink pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={appt.status === "archived" ? "/archive" : "/appointments"} className="kicker inline-flex items-center gap-1 text-ink-3 hover:text-ink">
            <ChevronLeft className="h-3.5 w-3.5" /> {appt.status === "archived" ? "Архив" : "Приёмы"}
          </Link>
          <span className="kicker text-ink-3">
            Приём № {appt.id.slice(-6).toUpperCase()} · {fmtDateTime(appt.createdAt)}
          </span>
        </div>
        <h1 className="mt-5 font-serif text-[40px] leading-[1.05] font-semibold tracking-[-0.02em]">{appt.patient.fullName}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-ink-2">
          {appt.patient.dateOfBirth && (
            <span>
              {fmtDate(appt.patient.dateOfBirth)} <span className="text-ink-3">({age})</span>
            </span>
          )}
          {appt.patient.externalPatientId && <span className="font-mono text-[13px]">ID {appt.patient.externalPatientId}</span>}
          {appt.reason && <span>{appt.reason}</span>}
          <AppointmentStatusBadge status={appt.status} />
        </div>
      </div>

      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-12">
          {showConsent && <ConsentCard appt={appt} onChange={refresh} index={idx.consent} />}
          {showRecording && (
            <RecordingCard
              index={idx.recording}
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
          <TranscriptCard appt={appt} onChange={refresh} pendingUploads={pendingUploads} realtime={realtime} index={idx.transcript} />
          {locked ? (
            showDocs && <LockedNotice title="Медицинские документы" />
          ) : (
            <DocumentsCard appt={appt} templates={templates} defaultTemplateId={defaultTemplateId} onChange={refresh} index={idx.docs} />
          )}
        </div>

        <aside className="space-y-8 lg:sticky lg:top-24">
          <section className="border-t-2 border-ink">
            <p className="kicker pt-3 pb-2 text-ink-3">Сведения</p>
            <dl className="text-[14px]">
              {[
                ["Врач", appt.doctorName],
                ["Начало", appt.startedAt ? fmtDateTime(appt.startedAt) : null],
                ["Окончание", appt.endedAt ? fmtDateTime(appt.endedAt) : null],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="border-b border-line py-2">
                    <dt className="kicker text-ink-3">{k}</dt>
                    <dd className="mt-0.5 text-ink">{v}</dd>
                  </div>
                ))}
              <div className="border-b border-line py-2">
                <dt className="kicker text-ink-3">Согласие</dt>
                <dd className="mt-1">{consentLabel}</dd>
              </div>
            </dl>
          </section>

          <section className="border-t-2 border-ink">
            <p className="kicker pt-3 pb-3 text-ink-3">Ход приёма</p>
            <Stepper appt={appt} />
          </section>

          {appt.status === "review" && (
            <section className="border-t-2 border-ink pt-3">
              <p className="kicker text-ink-3">Завершение</p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                {allApproved ? "Все документы подтверждены — приём можно завершить." : "Сформируйте документы и подтвердите каждый из них."}
              </p>
              <Button className="mt-4 w-full" onClick={() => changeStatus("complete")} disabled={!allApproved} loading={busy === "complete"}>
                Завершить приём
              </Button>
            </section>
          )}
          {appt.status === "completed" && (
            <section className="border-t-2 border-ink pt-3">
              <p className="kicker text-ink-3">Приём завершён</p>
              <div className="mt-4 flex flex-col gap-2">
                <Button onClick={() => changeStatus("archive")} loading={busy === "archive"}>
                  Перевести в архив
                </Button>
                <Button variant="secondary" onClick={() => changeStatus("reopen")} loading={busy === "reopen"}>
                  Вернуть на проверку
                </Button>
              </div>
            </section>
          )}
          {appt.status === "archived" && (
            <section className="border-t-2 border-ink pt-3">
              <p className="kicker text-ink-3">В архиве с {fmtDateTime(appt.archivedAt)}</p>
              <p className="mt-1 text-[13px] text-ink-3">Только просмотр.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
