import { z } from "zod";
import { api, HttpError, ok, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

const schema = z.object({
  email: z.string().trim().toLowerCase().min(3, "укажите логин").max(200),
  currentPassword: z.string().min(1, "введите текущий пароль").max(200),
});

/** Смена логина (e-mail) — с подтверждением текущим паролем. */
export const POST = api(async (req) => {
  const user = await requireUser();
  const { email, currentPassword } = await parseBody(req, schema);
  const { users } = await collections();
  const full = await users.findOne({ _id: user._id });
  if (!full || !(await verifyPassword(currentPassword, full.passwordHash))) throw new HttpError(400, "Неверный текущий пароль");
  if (email === full.email) throw new HttpError(400, "Это ваш текущий логин");
  if (await users.findOne({ email })) throw new HttpError(409, "Этот логин уже занят");
  try {
    await users.updateOne({ _id: user._id }, { $set: { email, updatedAt: new Date() } });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new HttpError(409, "Этот логин уже занят");
    throw err;
  }
  return ok({ email });
});
