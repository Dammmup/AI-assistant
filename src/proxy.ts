import { NextResponse, type NextRequest } from "next/server";
import { PAYWALL_MESSAGE, isAccessLocked, isAllowedApi, isLockedPage } from "@/lib/paywall";

export function proxy(req: NextRequest) {
  if (!isAccessLocked()) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    if (isAllowedApi(req.method, pathname)) return NextResponse.next();
    return NextResponse.json({ error: PAYWALL_MESSAGE, paywall: true }, { status: 402 });
  }
  if (isLockedPage(pathname)) return NextResponse.rewrite(new URL("/locked", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
