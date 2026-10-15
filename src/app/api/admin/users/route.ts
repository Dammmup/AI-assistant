import { ObjectId } from "mongodb";
import { z } from "zod";
import { api, HttpError, ok, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { hashPassword } from "@/lib/password";

const userSchema = z.object({
  fullName: z.string().trim().min(3, "укажите ФИО").max(200),
  email: z.string().trim().toLowerCase().min(3).max(200),
  password: z.string().min(8, "пароль не короче 8 символов").max(200),
  role: z.enum(["doctor", "admin"]),
});

export const POST = api(async (req) => {
  await requireUser("admin");
  const body = await parseBody(req, userSchema);
  const { users } = await collections();
  if (await users.findOne({ email: body.email })) throw new HttpError(409, "Пользователь с таким логином уже существует");
  const now = new Date();
  await users.insertOne({
    _id: new ObjectId(),
    fullName: body.fullName,
    email: body.email,
    passwordHash: await hashPassword(body.password),
    role: body.role,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  return ok({}, 201);
});
