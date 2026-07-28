import { createAuthMiddleware, APIError, getSessionFromCtx } from "better-auth/api";

/**
 * Global `hooks.before` guards (docs/auth-plan.md §6). Wired as Better Auth's
 * `hooks.before`, so it runs before every endpoint; we only act on these paths.
 *
 *  1. POST /sign-up/email and POST /change-email — with `requireEmailVerification`
 *     on, Better Auth deliberately returns a *generic success* when the target
 *     email already belongs to someone (an anti-enumeration measure — see
 *     dist/api/routes/sign-up.mjs `shouldReturnGenericDuplicateResponse`, and the
 *     `findUserByEmail` short-circuit in dist/api/routes/update-user.mjs). It
 *     never creates/changes anything but responds as if it did, so the UI happily
 *     tells the person to check their inbox while the address stays taken. We want
 *     the explicit "email already exists" error, so we detect the duplicate up
 *     front and throw USER_ALREADY_EXISTS (already mapped in lib/errorMap.ts).
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
  body?: { email?: string; newEmail?: string; userId?: string };
  context: {
    internalAdapter: {
      findUserByEmail: (email: string) => Promise<{ user?: unknown } | null>;
      findUserById: (id: string) => Promise<{ role?: string | null } | null>;
    };
  };
};

const emailAlreadyExists = () =>
  new APIError("UNPROCESSABLE_ENTITY", {
    code: "USER_ALREADY_EXISTS",
    message: "An account with this email already exists.",
  });

export const guardHook = createAuthMiddleware(async (ctx) => {
  const c = ctx as unknown as GuardCtx;

  if (c.path === "/sign-up/email") {
    const email = c.body?.email;
    if (!email) return;
    const existing = await c.context.internalAdapter.findUserByEmail(email);
    if (existing?.user) throw emailAlreadyExists();
    return;
  }

  if (c.path === "/change-email") {
    const newEmail = c.body?.newEmail?.toLowerCase();
    if (!newEmail) return;
    // change-email requires a session; if there isn't one, let Better Auth's
    // session middleware reject it rather than probing emails for an anonymous
    // caller (which would leak which addresses are registered).
    const session = await getSessionFromCtx(ctx);
    if (!session) return;
    // Changing to your own current address is "email is the same", not a
    // duplicate — let Better Auth's own check produce that message.
    if (session.user?.email?.toLowerCase() === newEmail) return;
    const existing = await c.context.internalAdapter.findUserByEmail(newEmail);
    if (existing?.user) throw emailAlreadyExists();
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
