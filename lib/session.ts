import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { isAdminRole, type SessionUser } from "./auth-types";
import { getOnboardingState } from "./onboarding";

/**
 * Server-side session helpers (docs/auth-contract.md §4). Every API route and
 * server component uses these to gate access and to scope queries by the
 * signed-in user. Proxy does the coarse redirect; THIS is the real
 * authorization boundary — never trust the middleware alone.
 *
 * Note: server-side `createdAt` is a Date object here; the SessionUser contract
 * type (a string) is the wire shape Dev B sees via useSession(). Server callers
 * use id/role/registrationNumber, so the cast is safe in practice.
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

/** Requires an authenticated account whose email address is verified. */
export async function requireVerifiedUser(currentPath?: string): Promise<SessionUser> {
  const user = await requireUser(currentPath);
  if (!user.emailVerified) redirect("/verify-email");
  return user;
}

/** Requires the student's first learning source to be fully prepared. */
export async function requirePreparedSource(currentPath?: string): Promise<SessionUser> {
  const user = await requireUser(currentPath);
  const state = await getOnboardingState(user);
  if (!state.hasPreparedSource) redirect("/upload");
  return user;
}

/** Requires a prepared source and a verified email for sensitive actions. */
export async function requireLearningAction(currentPath?: string): Promise<SessionUser> {
  const user = await requirePreparedSource(currentPath);
  if (!user.emailVerified) redirect("/verify-email");
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

/** API equivalent of requireVerifiedUser; does not require an uploaded source. */
export async function requireVerifiedUserApi(): Promise<SessionUser | Response> {
  const user = await requireUserApi();
  if (user instanceof Response) return user;
  if (!user.emailVerified) {
    return Response.json(
      { error: "Verify your email to use this feature.", code: "EMAIL_VERIFICATION_REQUIRED" },
      { status: 403 },
    );
  }
  return user;
}

export async function requirePreparedSourceApi(): Promise<SessionUser | Response> {
  const user = await requireUserApi();
  if (user instanceof Response) return user;
  const state = await getOnboardingState(user);
  if (!state.hasPreparedSource) {
    return Response.json(
      { error: "Upload and prepare your books first.", code: "UPLOAD_REQUIRED" },
      { status: 409 },
    );
  }
  return user;
}

export async function requireLearningActionApi(): Promise<SessionUser | Response> {
  const user = await requirePreparedSourceApi();
  if (user instanceof Response) return user;
  if (!user.emailVerified) {
    return Response.json(
      { error: "Verify your email to use this feature.", code: "EMAIL_VERIFICATION_REQUIRED" },
      { status: 403 },
    );
  }
  return user;
}

export async function requireAdminApi(): Promise<SessionUser | Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!isAdminRole(user.role))
    return Response.json({ error: "Admins only." }, { status: 403 });
  return user;
}
