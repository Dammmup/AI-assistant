import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import type { z } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Защита от межсайтовых запросов для изменяющих методов. */
function checkOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, "Запрос отклонён");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, "Запрос отклонён");
  }
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

export function api<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      checkOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: "Внутренняя ошибка сервера. Сохранённые данные не потеряны, повторите попытку." }, { status: 500 });
    }
  };
}

export async function parseBody<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Некорректный JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(400, issue ? `${issue.path.join(".") || "Данные"}: ${issue.message}` : "Некорректные данные");
  }
  return parsed.data;
}

export function oid(id: string | undefined | null): ObjectId {
  if (!id || !ObjectId.isValid(id)) throw new HttpError(404, "Не найдено");
  return new ObjectId(id);
}

export const ok = (data: unknown = { ok: true }, status = 200) => NextResponse.json(data, { status });
