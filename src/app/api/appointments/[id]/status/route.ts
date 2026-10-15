import { ObjectId } from "mongodb";
import { z } from "zod";
import { api, HttpError, ok, oid, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { assertStatus, getOwnAppointment, setStatus } from "@/lib/appointments";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ action: z.enum(["complete", "reopen", "archive"]) });

export const POST = api<Ctx>(async (req, { params }) => {
  const user = await requireUser("doctor");
  const appt = await getOwnAppointment(oid((await params).id), user);
  const { action } = await parseBody(req, schema);
  const { documents, transcripts, archive } = await collections();

  if (action === "complete") {
    assertStatus(appt, ["review"], "завершение приёма");
    const docs = await documents.find({ appointmentId: appt._id }, { projection: { status: 1 } }).toArray();
    if (docs.length === 0) throw new HttpError(409, "Сформируйте и подтвердите хотя бы один документ");
    if (docs.some((d) => d.status !== "approved")) throw new HttpError(409, "Все документы должны быть подтверждены врачом");
    const transcript = await transcripts.findOne({ appointmentId: appt._id }, { projection: { status: 1 } });
    if (transcript?.status === "in_progress") throw new HttpError(409, "Распознавание ещё не завершено");
    await setStatus(appt._id, "completed", { endedAt: appt.endedAt ?? new Date() });
    return ok();
  }

  if (action === "reopen") {
    assertStatus(appt, ["completed"], "возврат на проверку");
    await setStatus(appt._id, "review");
    return ok();
  }

  assertStatus(appt, ["completed"], "архивация");
  const now = new Date();
  await archive.updateOne(
    { appointmentId: appt._id },
    {
      $setOnInsert: {
        _id: new ObjectId(),
        appointmentId: appt._id,
        doctorId: appt.doctorId,
        patientName: appt.patientName,
        archivedBy: user._id,
        archivedAt: now,
        archiveStatus: "archived",
      },
    },
    { upsert: true },
  );
  await setStatus(appt._id, "archived");
  return ok();
});
