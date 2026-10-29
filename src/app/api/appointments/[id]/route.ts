import { z } from "zod";
import { api, ok, oid, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { assertStatus, finalizeIfReady, getOwnAppointment } from "@/lib/appointments";
import { appointmentDTO } from "@/lib/view";
import { isAccessLocked } from "@/lib/paywall";

type Ctx = { params: Promise<{ id: string }> };

export const GET = api<Ctx>(async (_req, { params }) => {
  const user = await requireUser("doctor");
  const id = oid((await params).id);
  let appt = await getOwnAppointment(id, user);
  if (appt.status === "processing") {
    await finalizeIfReady(id);
    appt = await getOwnAppointment(id, user);
  }
  const dto = await appointmentDTO(appt);
  if (isAccessLocked()) dto.documents = [];
  return ok(dto);
});

const schema = z.object({
  reason: z.string().trim().max(500).nullable().optional(),
  language: z.enum(["ru", "kk", "auto"]).optional(),
});

export const PATCH = api<Ctx>(async (req, { params }) => {
  const user = await requireUser("doctor");
  const appt = await getOwnAppointment(oid((await params).id), user);
  assertStatus(appt, ["draft", "review"], "изменение параметров");
  const body = await parseBody(req, schema);
  const { appointments } = await collections();
  await appointments.updateOne(
    { _id: appt._id },
    {
      $set: {
        ...(body.reason !== undefined ? { reason: body.reason || null } : {}),
        ...(body.language ? { language: body.language } : {}),
        updatedAt: new Date(),
      },
    },
  );
  return ok();
});
