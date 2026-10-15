import { api, HttpError, ok, oid } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { getOwnAppointment, processSegment, requireConsent } from "@/lib/appointments";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

export const POST = api<Ctx>(async (_req, { params }) => {
  const user = await requireUser("doctor");
  const { segments } = await collections();
  const segment = await segments.findOne({ _id: oid((await params).id) });
  if (!segment) throw new HttpError(404, "Фрагмент не найден");
  const appt = await getOwnAppointment(segment.appointmentId, user);
  if (["completed", "archived"].includes(appt.status)) throw new HttpError(409, "Приём уже завершён");
  await requireConsent(appt);
  const stale = segment.status === "pending" && Date.now() - segment.updatedAt.getTime() > 2 * 60_000;
  const emptyDone = segment.status === "done" && !segment.text;
  if (segment.status !== "failed" && !stale && !emptyDone) throw new HttpError(409, "Фрагмент уже обработан или обрабатывается");
  const updated = await processSegment(segment);
  return ok({ status: updated.status, text: updated.text, error: updated.error });
});
