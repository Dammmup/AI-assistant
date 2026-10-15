import { z } from "zod";
import { api, HttpError, ok, parseBody } from "@/lib/http";
import { collections } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/auth";

const schema = z.object({ email: z.string().trim().min(1).max(200), password: z.string().min(1).max(200) });

// Простейшее ограничение попыток входа в пределах экземпляра функции.
const attempts = new Map<string, { count: number; until: number }>();

export const POST = api(async (req) => {
  const { email, password } = await parseBody(req, schema);
  const key = email.toLowerCase();
  const a = attempts.get(key);
  if (a && a.count >= 5 && a.until > Date.now()) throw new HttpError(429, "Слишком много попыток. Повторите через несколько минут.");

  const { users } = await collections();
  const user = await users.findOne({ email: key });
  const valid = user && user.isActive && (await verifyPassword(password, user.passwordHash));
  if (!valid) {
    const next = a && a.until > Date.now() ? a.count + 1 : 1;
    attempts.set(key, { count: next, until: Date.now() + 5 * 60_000 });
    throw new HttpError(401, "Неверный логин или пароль");
  }
  attempts.delete(key);
  await createSession(user);
  return ok({ role: user.role });
});
