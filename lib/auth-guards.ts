import { createAuthMiddleware, APIError } from "better-auth/api";

/**
 * Global `hooks.before` guards (docs/auth-plan.md §6). Wired as Better Auth's
 * `hooks.before`, so it runs before every endpoint; we only act on two paths.
 *
 *  1. POST /sign-up/email — with `requireEmailVerification` on, Better Auth
 *     deliberately returns a *generic success* when the email is already
 *     registered (an anti-enumeration measure — see dist/api/routes/sign-up.mjs,
 *     `shouldReturnGenericDuplicateResponse`). It never creates the user but
 *     responds with a synthetic one, so the UI happily sends the person to
 *     /verify-email and the address silently stays taken. We want the explicit
 *     "email already registered" error, so we detect the duplicate up front and
 *     throw USER_ALREADY_EXISTS (already mapped in lib/errorMap.ts).
 *
 *  2. POST /admin/set-role and /admin/ban-user — the admin plugin has no concept
 *     of a protected role, so a super_admin can demote or ban *itself* (or any
 *     other super_admin), locking the system's only owner out permanently. We
 *     forbid either action whenever the TARGET is currently a super_admin —
 *     self-targeting included. The super_admin bootstrap (lib/auth.ts create
 *     hook) remains the only way a super_admin is ever assigned.
 */

type GuardCtx = {
  path: string;
  body?: { email?: string; userId?: string };
  context: {
    internalAdapter: {
      findUserByEmail: (email: string) => Promise<{ user?: unknown } | null>;
      findUserById: (id: string) => Promise<{ role?: string | null } | null>;
    };
  };
};

export const guardHook = createAuthMiddleware(async (ctx) => {
  const c = ctx as unknown as GuardCtx;

  if (c.path === "/sign-up/email") {
    const email = c.body?.email;
    if (!email) return;
    const existing = await c.context.internalAdapter.findUserByEmail(email);
    if (existing?.user) {
      throw new APIError("UNPROCESSABLE_ENTITY", {
        code: "USER_ALREADY_EXISTS",
        message: "An account with this email already exists.",
      });
    }
    return;
  }

  if (c.path === "/admin/set-role" || c.path === "/admin/ban-user") {
    const userId = c.body?.userId;
    if (!userId) return;
    const target = await c.context.internalAdapter.findUserById(userId);
    const targetRoles = String(target?.role ?? "")
      .split(",")
      .map((r) => r.trim());
    if (targetRoles.includes("super_admin")) {
      throw new APIError(
        "FORBIDDEN",
        c.path === "/admin/set-role"
          ? {
              code: "CANNOT_CHANGE_SUPER_ADMIN_ROLE",
              message: "A super admin's role cannot be changed.",
            }
          : {
              code: "CANNOT_BAN_SUPER_ADMIN",
              message: "A super admin cannot be banned.",
            }
      );
    }
    return;
  }
});
