import { api, HttpError, ok, oid, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { templateSchema } from "@/lib/template-schema";

type Ctx = { params: Promise<{ id: string }> };

/** Изменение шаблона повышает версию; уже созданные документы хранят снимок полей своей версии. */
export const PUT = api<Ctx>(async (req, { params }) => {
  await requireUser("admin");
  const id = oid((await params).id);
  const body = await parseBody(req, templateSchema);
  const { templates } = await collections();
  const current = await templates.findOne({ _id: id });
  if (!current) throw new HttpError(404, "Шаблон не найден");
  const contentChanged =
    JSON.stringify([current.name, current.documentType, current.description, current.fields]) !==
    JSON.stringify([body.name, body.documentType, body.description, body.fields]);
  await templates.updateOne(
    { _id: id },
    { $set: { ...body, updatedAt: new Date() }, ...(contentChanged ? { $inc: { version: 1 } } : {}) },
  );
  return ok();
});
