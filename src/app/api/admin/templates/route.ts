import { ObjectId } from "mongodb";
import { api, ok, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { templateSchema } from "@/lib/template-schema";

export const POST = api(async (req) => {
  await requireUser("admin");
  const body = await parseBody(req, templateSchema);
  const { templates } = await collections();
  const now = new Date();
  const _id = new ObjectId();
  await templates.insertOne({ _id, ...body, version: 1, createdAt: now, updatedAt: now });
  return ok({ id: _id.toHexString() }, 201);
});
