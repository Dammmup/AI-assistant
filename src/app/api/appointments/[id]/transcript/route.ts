import { z } from "zod";
import { api, HttpError, ok, oid, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { assertStatus, ensureTranscript, getOwnAppointment, setStatus } from "@/lib/appointments";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ text: z.string().max(200_000), expectedUpdatedAt: z.string().nullable().optional() });

/** Сохранение отредактированной врачом транскрипции. */
export const PUT = api<Ctx>(async (req, { params }) => {
  const user = await requireUser("doctor");
  const appt = await getOwnAppointment(oid((await params).id), user);
  assertStatus(appt, ["review"], "редактирование транскрипции");
  const { text, expectedUpdatedAt } = await parseBody(req, schema);
  const { transcripts } = await collections();
  const current = await transcripts.findOne({ appointmentId: appt._id });
  if (!current) throw new HttpError(404, "Транскрипция не найдена");
  if (expectedUpdatedAt && current.updatedAt.toISOString() !== expectedUpdatedAt) {
    throw new HttpError(409, "Транскрипция изменилась (дописан новый фрагмент). Обновите страницу, ваши правки скопируйте заранее.");
  }
  const now = new Date();
  await transcripts.updateOne(
    { _id: current._id },
    { $set: { text, isEdited: true, editedBy: user._id, editedAt: now, updatedAt: now } },
  );
  return ok({ updatedAt: now.toISOString() });
});

/** Ввод транскрипции вручную — если запись невозможна (нет доступа к API, пациент отказался от записи и т.п.). */
export const POST = api<Ctx>(async (_req, { params }) => {
  const user = await requireUser("doctor");
  const appt = await getOwnAppointment(oid((await params).id), user);
  assertStatus(appt, ["draft"], "ручной ввод транскрипции");
  if (!appt.consentId) throw new HttpError(409, "Сначала зафиксируйте решение пациента по согласию");
  const transcript = await ensureTranscript(appt, null, "manual");
  const { transcripts } = await collections();
  await transcripts.updateOne({ _id: transcript._id }, { $set: { status: "ready" } });
  await setStatus(appt._id, "review", { startedAt: appt.startedAt ?? new Date() });
  return ok();
});
