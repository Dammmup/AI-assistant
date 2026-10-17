import { api, ok } from "@/lib/http";
import { createSession, requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";

/** Выход на всех других устройствах: старые сессии становятся недействительными. */
export const POST = api(async () => {
  const user = await requireUser();
  const { users } = await collections();
  const updated = await users.findOneAndUpdate({ _id: user._id }, { $inc: { sessionVersion: 1 } }, { returnDocument: "after" });
  await createSession(updated!);
  return ok();
});
