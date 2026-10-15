import { NextResponse } from "next/server";

/** Лёгкий эндпоинт для измерения задержки (пинга) до сервера. */
export function GET() {
  return NextResponse.json({ t: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
