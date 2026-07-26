import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { isAdminRole, type SessionUser } from "./auth-types";

/**
 * Server-side session helpers (docs/auth-contract.md §4). Every API route and
 * server component uses these to gate access and to scope queries by the
 * signed-in user. Middleware does the coarse redirect; THIS is the real
 * authorization boundary — never trust the middleware alone.
 *
 * Note: server-side `createdAt` is a Date object here; the SessionUser contract
 * type (a string) is the wire shape Dev B sees via useSession(). Server callers
 * use id/role/studentId, so the cast is safe in practice.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return (session?.user as unknown as SessionUser) ?? null;
}

/** Redirects to /login (preserving where they were) if not signed in. */
export async function requireUser(currentPath?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(currentPath ? `/login?redirect=${encodeURIComponent(currentPath)}` : "/login");
  }
  return user;
}

/** Requires admin or super_admin; students are bounced to their dashboard. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdminRole(user.role)) redirect("/dashboard");
  return user;
}

/** Requires super_admin; everyone else is bounced to their dashboard. */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "super_admin") redirect("/dashboard");
  return user;
}

/**
 * API-route guards. Unlike the redirecting helpers above, these return a JSON
 * Response for the caller to short-circuit with — the right shape for fetch
 * clients (no HTML redirect). Usage:
 *
 *   const gate = await requireAdminApi();
 *   if (gate instanceof Response) return gate;
 *   // gate is the SessionUser
 */
export async function requireUserApi(): Promise<SessionUser | Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  return user;
}

export async function requireAdminApi(): Promise<SessionUser | Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!isAdminRole(user.role))
    return Response.json({ error: "Admins only." }, { status: 403 });
  return user;
}
