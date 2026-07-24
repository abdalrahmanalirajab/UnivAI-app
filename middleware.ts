import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Coarse route protection (docs/auth-contract.md §4). This only checks for a
 * session cookie's PRESENCE — it is an optimization, not the authorization
 * boundary. Real role checks live server-side in lib/session.ts (requireAdmin)
 * and in each API route.
 *
 * Phase 1 scope: gate the NEW auth-owned pages (/profile, /admin) and bounce
 * signed-in users away from /login and /register. The existing demo pages
 * (/dashboard, /schedule, /upload, /exams, /lecture) are added to the matcher
 * in Phase 5, once they are scoped per-user and the login page exists.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(getSessionCookie(req));

  if (pathname === "/login" || pathname === "/register") {
    return hasSession
      ? NextResponse.redirect(new URL("/dashboard", req.url))
      : NextResponse.next();
  }

  if (!hasSession) {
    const url = new URL("/login", req.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/profile/:path*",
    "/admin/:path*",
    "/login",
    "/register",
    // Phase 5 (after per-user scoping): "/dashboard/:path*", "/schedule/:path*",
    // "/upload/:path*", "/exams/:path*", "/lecture/:path*",
  ],
};
