import { ObjectId } from "mongodb";
import { z } from "zod";
import { api, HttpError, ok, oid, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { assertStatus, getOwnAppointment } from "@/lib/appointments";
import { CONSENT_TYPE, CONSENT_VERSION } from "@/lib/consent";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  status: z.enum(["obtained", "declined"]),
  method: z.enum(["verbal", "written"]).default("verbal"),
  note: z.string().trim().max(500).nullable().optional(),
  consentTextVersion: z.string(),
  confirmed: z.literal(true, { message: "подтвердите, что согласие получено" }).optional(),
});

export const POST = api<Ctx>(async (req, { params }) => {
  const user = await requireUser("doctor");
  const appt = await getOwnAppointment(oid((await params).id), user);
  assertStatus(appt, ["draft"], "фиксация согласия");
  const body = await parseBody(req, schema);
  if (body.consentTextVersion !== CONSENT_VERSION) throw new HttpError(409, "Текст согласия обновился, обновите страницу");
  if (body.status === "obtained" && !body.confirmed) throw new HttpError(400, "Подтвердите, что согласие получено");

  const { consents, appointments } = await collections();
  const now = new Date();
  const _id = new ObjectId();
  await consents.insertOne({
    _id,
    appointmentId: appt._id,
    consentType: CONSENT_TYPE,
    consentTextVersion: CONSENT_VERSION,
    method: body.method,
    status: body.status,
    obtainedAt: now,
    obtainedBy: user._id,
    note: body.note || null,
  });
  await appointments.updateOne({ _id: appt._id }, { $set: { consentId: _id, updatedAt: now } });
  return ok();
});
