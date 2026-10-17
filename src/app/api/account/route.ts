import { ObjectId } from "mongodb";
import { z } from "zod";
import { api, HttpError, ok, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";

const schema = z.object({
  fullName: z.string().trim().min(3, "укажите ФИО").max(200),
  position: z.string().trim().max(200).nullable().optional(),
  organization: z.string().trim().max(300).nullable().optional(),
  preferences: z
    .object({
      defaultLanguage: z.enum(["ru", "kk", "auto"]).optional(),
      defaultTemplateId: z.string().nullable().optional(),
      avatarColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .nullable()
        .optional(),
    })
    .optional(),
});

/** Профиль и персональные настройки текущего пользователя. */
export const PATCH = api(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, schema);
  const { users, templates } = await collections();
  const prefs = { ...(user.preferences ?? {}), ...(body.preferences ?? {}) };
  if (prefs.defaultTemplateId) {
    if (!ObjectId.isValid(prefs.defaultTemplateId) || !(await templates.findOne({ _id: new ObjectId(prefs.defaultTemplateId), isActive: true }))) {
      throw new HttpError(400, "Шаблон не найден или отключён");
    }
  }
  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        fullName: body.fullName,
        position: body.position || null,
        organization: body.organization || null,
        preferences: prefs,
        updatedAt: new Date(),
      },
    },
  );
  return ok();
});
