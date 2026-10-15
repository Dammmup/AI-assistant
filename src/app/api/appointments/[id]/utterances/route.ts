import { ObjectId } from "mongodb";
import { z } from "zod";
import { api, HttpError, ok, oid, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { detectRoles, ensureRecording, ensureTranscript, getOwnAppointment, requireConsent, syncTranscript } from "@/lib/appointments";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

const schema = z.object({
  sessionId: z.string().min(1).max(64),
  items: z
    .array(
      z.object({
        clientId: z.string().min(1).max(80),
        speakerId: z.string().max(16).default("?"),
        language: z.string().max(10).nullable().optional(),
        text: z.string().max(20_000),
        startAt: z.number(),
        endAt: z.number(),
      }),
    )
    .max(200),
});

/** Сохранение законченных реплик потокового распознавания (идемпотентно по clientId). */
export const POST = api<Ctx>(async (req, { params }) => {
  const user = await requireUser("doctor");
  const appt = await getOwnAppointment(oid((await params).id), user);
  if (!["recording", "processing", "review"].includes(appt.status)) throw new HttpError(409, "Запись не ведётся");
  await requireConsent(appt);
  const { sessionId, items } = await parseBody(req, schema);
  const { utterances, transcripts } = await collections();
  const recording = await ensureRecording(appt);
  await ensureTranscript(appt, recording._id, "soniox");
  await transcripts.updateOne({ appointmentId: appt._id }, { $set: { provider: "soniox" } });

  const now = new Date();
  const inserted: string[] = [];
  for (const it of items) {
    if (!it.text.trim()) continue;
    const res = await utterances.updateOne(
      { appointmentId: appt._id, clientId: it.clientId },
      {
        $setOnInsert: {
          _id: new ObjectId(),
          appointmentId: appt._id,
          clientId: it.clientId,
          sessionId,
          speakerId: it.speakerId,
          language: it.language ?? null,
          text: it.text.trim(),
          startAt: new Date(it.startAt),
          endAt: new Date(it.endAt),
          createdAt: now,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) inserted.push(it.text.trim());
  }
  if (inserted.length) await syncTranscript(appt._id, inserted.join(" "));
  await detectRoles(appt._id);
  const { appointments } = await collections();
  const fresh = await appointments.findOne({ _id: appt._id }, { projection: { speakerRoles: 1 } });
  return ok({ roles: fresh?.speakerRoles ?? {} });
});
