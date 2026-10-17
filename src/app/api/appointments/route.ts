import { ObjectId } from "mongodb";
import { z } from "zod";
import { api, HttpError, ok, oid, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import type { AppointmentDoc, PatientDoc } from "@/lib/types";
import { normalizeFullName, todayIso, validateBirthDate, validateFullName } from "@/lib/patient-validation";

const schema = z.object({
  patientId: z.string().optional(),
  newPatient: z
    .object({
      fullName: z
        .string()
        .max(300)
        .transform(normalizeFullName)
        .superRefine((v, ctx) => {
          const err = validateFullName(v);
          if (err) ctx.addIssue({ code: "custom", message: err });
        }),
      dateOfBirth: z
        .string()
        .nullable()
        .optional()
        .superRefine((v, ctx) => {
          const err = validateBirthDate(v, todayIso("Asia/Almaty"));
          if (err) ctx.addIssue({ code: "custom", message: err });
        }),
      externalPatientId: z.string().trim().max(100).nullable().optional(),
    })
    .optional(),
  reason: z.string().trim().max(500).nullable().optional(),
  language: z.enum(["ru", "kk", "auto"]).default("ru"),
});

export const POST = api(async (req) => {
  const user = await requireUser("doctor");
  const body = await parseBody(req, schema);
  const { patients, appointments } = await collections();
  const now = new Date();

  let patient: PatientDoc | null = null;
  if (body.patientId) {
    patient = await patients.findOne({ _id: oid(body.patientId), createdBy: user._id });
    if (!patient) throw new HttpError(404, "Пациент не найден");
  } else if (body.newPatient) {
    patient = {
      _id: new ObjectId(),
      fullName: body.newPatient.fullName,
      fullNameLower: body.newPatient.fullName.toLowerCase(),
      dateOfBirth: body.newPatient.dateOfBirth || null,
      externalPatientId: body.newPatient.externalPatientId || null,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    };
    await patients.insertOne(patient);
  } else {
    throw new HttpError(400, "Укажите пациента");
  }

  const appt: AppointmentDoc = {
    _id: new ObjectId(),
    patientId: patient._id,
    doctorId: user._id,
    patientName: patient.fullName,
    reason: body.reason || null,
    language: body.language,
    status: "draft",
    startedAt: null,
    endedAt: null,
    consentId: null,
    createdAt: now,
    updatedAt: now,
  };
  await appointments.insertOne(appt);
  await patients.updateOne({ _id: patient._id }, { $set: { updatedAt: now } });
  return ok({ id: appt._id.toHexString() }, 201);
});
