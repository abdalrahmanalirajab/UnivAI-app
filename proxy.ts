import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Coarse authentication gate for page routes. API routes enforce their own
 * authorization through the helpers in lib/session.ts.
 */
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(getSessionCookie(req));
  const standaloneDevPage =
    process.env.UNIVAI_MODE === "standalone" &&
    (pathname === "/dev/scenarios" || pathname.startsWith("/lecture/"));

  if (hasSession && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/start", req.url));
  }

  if (!hasSession && !PUBLIC_PATHS.has(pathname) && !standaloneDevPage) {
    const url = new URL("/login", req.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|.*\\.).*)"],
};
