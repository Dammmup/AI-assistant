import { z } from "zod";
import { api, HttpError, ok, oid, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { getOwnAppointment } from "@/lib/appointments";
import { approvalBlockers } from "@/lib/rules";
import type { DocumentFieldValue } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    expectedUpdatedAt: z.string(),
    content: z.record(
      z.string(),
      z.object({ value: z.string().max(20_000), confirmed: z.boolean().optional() }),
    ),
  }),
  z.object({ action: z.literal("approve"), confirm: z.literal(true, { message: "подтвердите проверку документа" }) }),
  z.object({ action: z.literal("reopen") }),
]);

export const PATCH = api<Ctx>(async (req, { params }) => {
  const user = await requireUser("doctor");
  const { documents } = await collections();
  const doc = await documents.findOne({ _id: oid((await params).id) });
  if (!doc) throw new HttpError(404, "Документ не найден");
  const appt = await getOwnAppointment(doc.appointmentId, user);
  if (appt.status !== "review") throw new HttpError(409, "Документы можно менять только на этапе проверки приёма");
  const body = await parseBody(req, schema);
  const now = new Date();

  if (body.action === "save") {
    if (doc.status === "approved") throw new HttpError(409, "Документ подтверждён. Верните его на проверку, чтобы изменить.");
    if (doc.updatedAt.toISOString() !== body.expectedUpdatedAt) {
      throw new HttpError(409, "Документ был изменён в другой вкладке или сформирован заново. Обновите страницу.");
    }
    const content: Record<string, DocumentFieldValue> = { ...doc.content };
    for (const field of doc.fields) {
      const incoming = body.content[field.key];
      const prev = doc.content[field.key] ?? { value: "", status: "missing", evidence: null };
      if (!incoming) continue;
      const value = incoming.value.trim();
      const changed = value !== prev.value;
      // Любое изменение или явная отметка врача — поле считается проверенным.
      const status = changed || incoming.confirmed ? "confirmed" : prev.status;
      content[field.key] = { value, status, evidence: prev.evidence };
    }
    await documents.updateOne(
      { _id: doc._id },
      { $set: { content, status: "review", reviewedBy: user._id, reviewedAt: now, updatedAt: now } },
    );
    return ok({ updatedAt: now.toISOString() });
  }

  if (body.action === "approve") {
    if (doc.status !== "review") throw new HttpError(409, "Перед подтверждением сохраните проверенный документ");
    const blockers = approvalBlockers(doc);
    if (blockers.length) throw new HttpError(409, `Нельзя подтвердить документ:\n${blockers.join("\n")}`);
    await documents.updateOne({ _id: doc._id }, { $set: { status: "approved", approvedBy: user._id, approvedAt: now, updatedAt: now } });
    return ok();
  }

  if (doc.status !== "approved") throw new HttpError(409, "Документ не подтверждён");
  await documents.updateOne({ _id: doc._id }, { $set: { status: "review", approvedBy: null, approvedAt: null, updatedAt: now } });
  return ok();
});

export const DELETE = api<Ctx>(async (_req, { params }) => {
  const user = await requireUser("doctor");
  const { documents } = await collections();
  const doc = await documents.findOne({ _id: oid((await params).id) });
  if (!doc) throw new HttpError(404, "Документ не найден");
  const appt = await getOwnAppointment(doc.appointmentId, user);
  if (appt.status !== "review" || doc.status === "approved") throw new HttpError(409, "Удалить можно только неподтверждённый документ на этапе проверки");
  await documents.deleteOne({ _id: doc._id });
  return ok();
});
