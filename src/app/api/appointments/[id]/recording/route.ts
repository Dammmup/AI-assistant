import { z } from "zod";
import { api, ok, oid, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { assertStatus, ensureRecording, ensureTranscript, finalizeIfReady, getOwnAppointment, requireConsent, setStatus } from "@/lib/appointments";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ action: z.enum(["start", "stop"]) });

export const POST = api<Ctx>(async (req, { params }) => {
  const user = await requireUser("doctor");
  const appt = await getOwnAppointment(oid((await params).id), user);
  const { action } = await parseBody(req, schema);

  if (action === "start") {
    // Повторный старт из статуса recording — продолжение после перезагрузки страницы.
    assertStatus(appt, ["draft", "recording", "review"], "начало записи");
    await requireConsent(appt);
    const recording = await ensureRecording(appt);
    await ensureTranscript(appt, recording._id);
    const { transcripts } = await collections();
    await transcripts.updateOne({ appointmentId: appt._id }, { $set: { status: "in_progress" } });
    await setStatus(appt._id, "recording", { startedAt: appt.startedAt ?? new Date(), endedAt: null });
    return ok({ nextSeq: recording.segmentsCount });
  }

  assertStatus(appt, ["recording"], "завершение записи");
  const { recordings } = await collections();
  await recordings.updateOne({ appointmentId: appt._id }, { $set: { status: "processing", updatedAt: new Date() } });
  await setStatus(appt._id, "processing", { endedAt: new Date() });
  await finalizeIfReady(appt._id);
  return ok();
});
