import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { collections } from "./db";
import { HttpError } from "./http";
import type { Role, UserDoc } from "./types";

export const SESSION_COOKIE = "ms_session";
const SESSION_HOURS = 12;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET не задан или короче 32 символов");
  return new TextEncoder().encode(s);
}

export async function createSession(user: Pick<UserDoc, "_id" | "role">) {
  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user._id.toHexString())
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export type SessionUser = Pick<UserDoc, "_id" | "fullName" | "email" | "role">;

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let sub: string | undefined;
  try {
    const { payload } = await jwtVerify(token, secret());
    sub = payload.sub;
  } catch {
    return null;
  }
  if (!sub || !ObjectId.isValid(sub)) return null;
  const { users } = await collections();
  const user = await users.findOne(
    { _id: new ObjectId(sub), isActive: true },
    { projection: { fullName: 1, email: 1, role: 1 } },
  );
  return user;
}

/** Для обработчиков API. */
export async function requireUser(role?: Role): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Требуется авторизация");
  if (role && user.role !== role) throw new HttpError(403, "Недостаточно прав");
  return user;
}

/** Для серверных страниц. */
export async function requirePageUser(role?: Role): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (role && user.role !== role) redirect("/");
  return user;
}
