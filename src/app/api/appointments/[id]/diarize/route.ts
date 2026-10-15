import { api, ok, oid } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { diarizePending, getOwnAppointment, requireConsent } from "@/lib/appointments";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

/** Разметка по говорящим новых фрагментов (вызывается во время записи). Возвращает метки фрагментов. */
export const POST = api<Ctx>(async (_req, { params }) => {
  const user = await requireUser("doctor");
  const appt = await getOwnAppointment(oid((await params).id), user);
  await requireConsent(appt);
  await diarizePending(appt._id);
  const { segments } = await collections();
  const list = await segments.find({ appointmentId: appt._id }, { projection: { units: 1, speakers: 1 } }).toArray();
  return ok(list.map((s) => ({ id: s._id.toHexString(), units: s.units ?? [], speakers: s.speakers ?? null })));
});
