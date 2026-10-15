import { ObjectId } from "mongodb";
import { z } from "zod";
import { api, HttpError, ok, oid, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { assertStatus, getOwnAppointment, requireConsent } from "@/lib/appointments";
import { AiError, fillTemplate, LLM_MODEL } from "@/lib/ai";
import type { DocumentFieldValue, MedicalDocumentDoc } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

const schema = z.object({ templateId: z.string(), mode: z.enum(["ai", "blank"]).default("ai") });

/** Формирование документа по шаблону: ИИ-черновик на основе транскрипции либо пустой бланк. */
export const POST = api<Ctx>(async (req, { params }) => {
  const user = await requireUser("doctor");
  const appt = await getOwnAppointment(oid((await params).id), user);
  assertStatus(appt, ["review"], "формирование документа");
  const { templateId, mode } = await parseBody(req, schema);
  const { templates, documents, transcripts } = await collections();
  const template = await templates.findOne({ _id: oid(templateId), isActive: true });
  if (!template) throw new HttpError(404, "Шаблон не найден или отключён");

  const existing = await documents.findOne({ appointmentId: appt._id, templateId: template._id });
  if (existing?.status === "approved") throw new HttpError(409, "Документ уже подтверждён. Чтобы изменить его, верните документ на проверку.");

  let content: Record<string, DocumentFieldValue>;
  if (mode === "ai") {
    await requireConsent(appt);
    const transcript = await transcripts.findOne({ appointmentId: appt._id });
    if (!transcript?.text.trim()) throw new HttpError(409, "Транскрипция пуста — нечего передать ИИ");
    if (transcript.status === "in_progress") throw new HttpError(409, "Дождитесь окончания распознавания");
    try {
      content = await fillTemplate({ templateName: template.name, fields: template.fields, transcript: transcript.text });
    } catch (err) {
      if (err instanceof AiError) throw new HttpError(502, err.message);
      throw err;
    }
  } else {
    content = Object.fromEntries(template.fields.map((f) => [f.key, { value: "", status: "missing", evidence: null }]));
  }

  const now = new Date();
  const base = {
    templateName: template.name,
    templateVersion: template.version,
    documentType: template.documentType,
    fields: template.fields,
    content,
    status: mode === "ai" ? ("generated" as const) : ("draft" as const),
    model: mode === "ai" ? LLM_MODEL : null,
    generatedAt: mode === "ai" ? now : null,
    reviewedBy: null,
    reviewedAt: null,
    approvedBy: null,
    approvedAt: null,
    updatedAt: now,
  };
  if (existing) {
    await documents.updateOne({ _id: existing._id }, { $set: base });
    return ok({ id: existing._id.toHexString() });
  }
  const doc: MedicalDocumentDoc = { _id: new ObjectId(), appointmentId: appt._id, templateId: template._id, createdAt: now, ...base };
  await documents.insertOne(doc);
  return ok({ id: doc._id.toHexString() }, 201);
});
