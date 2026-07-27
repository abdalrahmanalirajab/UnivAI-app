import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Deny-by-default route protection. A guest (no session) may see ONLY the
 * public pages below — the landing page and the auth screens. Every other page
 * (/dashboard, /schedule, /upload, /exams, /lecture/*, /admin, /profile, …)
 * redirects to /login with a ?redirect back to where they were headed.
 *
 * This is the coarse *authentication* gate. Role checks (student vs admin vs
 * super_admin) still happen server-side in lib/session.ts. API routes are NOT
 * matched here — they guard themselves (requireUserApi / requireAdminApi) and
 * return JSON 401/403, and the exam webhook + Better Auth endpoints must stay
 * reachable to server-to-server callers.
 */
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(getSessionCookie(req));
  const standaloneDevPage =
    process.env.UNIVAI_MODE === "standalone" &&
    process.env.NODE_ENV !== "production" &&
    pathname === "/dev/scenarios";

  // Signed-in users have no business on the login/register screens.
  if (hasSession && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Guests may only be on a public page; everything else → login.
  if (!hasSession && !PUBLIC_PATHS.has(pathname) && !standaloneDevPage) {
    const url = new URL("/login", req.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on every page route, but skip API routes (self-guarding), Next
  // internals, and static files (anything with a dot, e.g. .ico / .svg / .html).
  matcher: ["/((?!api|_next|.*\\.).*)"],
};
