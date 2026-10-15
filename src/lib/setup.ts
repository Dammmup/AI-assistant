import type { Db } from "mongodb";
import { DEFAULT_TEMPLATES } from "./default-templates";
import { hashPassword } from "./password";
import type { DocumentTemplateDoc, UserDoc } from "./types";

/** Индексы и начальные данные. Выполняется один раз на холодный старт. */
export async function ensureSetup(db: Db) {
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("patients").createIndex({ createdBy: 1, fullNameLower: 1 }),
    db.collection("appointments").createIndex({ doctorId: 1, status: 1, createdAt: -1 }),
    db.collection("consents").createIndex({ appointmentId: 1 }),
    db.collection("recordings").createIndex({ appointmentId: 1 }, { unique: true }),
    db.collection("recording_segments").createIndex({ recordingId: 1, seq: 1 }, { unique: true }),
    db.collection("transcripts").createIndex({ appointmentId: 1 }, { unique: true }),
    db.collection("medical_documents").createIndex({ appointmentId: 1 }),
    db.collection("archive").createIndex({ appointmentId: 1 }, { unique: true }),
    db.collection("archive").createIndex({ doctorId: 1, archivedAt: -1 }),
  ]);

  const templates = db.collection<DocumentTemplateDoc>("document_templates");
  if ((await templates.estimatedDocumentCount()) === 0) {
    const now = new Date();
    await templates.insertMany(
      DEFAULT_TEMPLATES.map((t) => ({ ...t, version: 1, isActive: true, createdAt: now, updatedAt: now })) as DocumentTemplateDoc[],
    );
  }

  const users = db.collection<UserDoc>("users");
  if ((await users.estimatedDocumentCount()) === 0) {
    const seed: { email?: string; password?: string; name?: string; role: UserDoc["role"] }[] = [
      { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, name: process.env.ADMIN_NAME || "Администратор", role: "admin" },
      { email: process.env.DEMO_DOCTOR_EMAIL, password: process.env.DEMO_DOCTOR_PASSWORD, name: process.env.DEMO_DOCTOR_NAME || "Врач", role: "doctor" },
    ];
    const now = new Date();
    for (const s of seed) {
      if (!s.email || !s.password) continue;
      await users.updateOne(
        { email: s.email.trim().toLowerCase() },
        {
          $setOnInsert: {
            fullName: s.name!,
            email: s.email.trim().toLowerCase(),
            passwordHash: await hashPassword(s.password),
            role: s.role,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true },
      );
    }
  }
}
