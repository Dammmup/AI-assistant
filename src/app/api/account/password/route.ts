import { z } from "zod";
import { api, HttpError, ok, parseBody } from "@/lib/http";
import { createSession, requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

const schema = z.object({
  currentPassword: z.string().min(1, "введите текущий пароль").max(200),
  newPassword: z.string().min(8, "новый пароль — не короче 8 символов").max(200),
});

/** Смена пароля. Остальные сессии завершаются, текущая продлевается с новым ключом. */
export const POST = api(async (req) => {
  const user = await requireUser();
  const { currentPassword, newPassword } = await parseBody(req, schema);
  const { users } = await collections();
  const full = await users.findOne({ _id: user._id });
  if (!full || !(await verifyPassword(currentPassword, full.passwordHash))) throw new HttpError(400, "Неверный текущий пароль");
  if (currentPassword === newPassword) throw new HttpError(400, "Новый пароль совпадает с текущим");
  if (newPassword.toLowerCase().includes(full.email.split("@")[0].toLowerCase())) {
    throw new HttpError(400, "Пароль не должен содержать логин");
  }
  const updated = await users.findOneAndUpdate(
    { _id: user._id },
    { $set: { passwordHash: await hashPassword(newPassword), updatedAt: new Date() }, $inc: { sessionVersion: 1 } },
    { returnDocument: "after" },
  );
  await createSession(updated!);
  return ok();
});
