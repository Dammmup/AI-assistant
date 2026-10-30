import { NextResponse, type NextRequest } from "next/server";

/**
 * Режим «сервис недоступен» (SERVICE_UNAVAILABLE=1): любая страница и любой запрос к API
 * получают 503, само приложение не выполняется.
 */
const PAGE = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Сервис недоступен</title>
<style>
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box;
    background: #f6f5f0; color: #141414;
    font-family: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 520px; width: 100%; border-top: 2px solid #141414; padding-top: 20px; }
  p.code { margin: 0; font: 12px/1 "IBM Plex Mono", ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; color: #c4321f; }
  h1 { margin: 16px 0 0; font: 600 40px/1.1 "Source Serif 4", Georgia, "Times New Roman", serif; letter-spacing: -.02em; }
  p.text { margin: 14px 0 0; font-size: 16px; line-height: 1.55; color: #77756e; }
</style>
</head>
<body>
<main>
  <p class="code">503</p>
  <h1>Сервис недоступен</h1>
  <p class="text">Сервис временно недоступен. Попробуйте зайти позже.</p>
</main>
</body>
</html>`;

export function proxy(req: NextRequest) {
  if (process.env.SERVICE_UNAVAILABLE !== "1") return NextResponse.next();
  const headers = { "Retry-After": "3600", "Cache-Control": "no-store" };
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503, headers });
  }
  return new NextResponse(PAGE, { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
