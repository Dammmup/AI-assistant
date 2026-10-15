import { z } from "zod";
import { api, HttpError, ok, oid, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { hashPassword } from "@/lib/password";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  fullName: z.string().trim().min(3).max(200).optional(),
  role: z.enum(["doctor", "admin"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8, "пароль не короче 8 символов").max(200).optional(),
});

export const PATCH = api<Ctx>(async (req, { params }) => {
  const admin = await requireUser("admin");
  const id = oid((await params).id);
  const body = await parseBody(req, schema);
  if (id.equals(admin._id) && (body.isActive === false || body.role === "doctor")) {
    throw new HttpError(409, "Нельзя отключить себя или снять с себя роль администратора");
  }
  const { users } = await collections();
  const res = await users.updateOne(
    { _id: id },
    {
      $set: {
        ...(body.fullName ? { fullName: body.fullName } : {}),
        ...(body.role ? { role: body.role } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
        updatedAt: new Date(),
      },
    },
  );
  if (!res.matchedCount) throw new HttpError(404, "Пользователь не найден");
  return ok();
});
