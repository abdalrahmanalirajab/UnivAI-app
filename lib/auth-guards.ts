import { createAuthMiddleware, APIError, getSessionFromCtx } from "better-auth/api";
import { normalizeName, validateName } from "./validators";

/**
 * Global `hooks.before` guards (docs/auth-plan.md §6). Wired as Better Auth's
 * `hooks.before`, so it runs before every endpoint; we only act on these paths.
 *
 *  1. POST /sign-up/email and POST /change-email — keep duplicate-email behavior
 *     explicit and stable across Better Auth verification modes. The UI maps
 *     USER_ALREADY_EXISTS to the email field, so we detect the duplicate up front
 *     and throw that code.
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
  body?: {
    name?: unknown;
    email?: string;
    newEmail?: string;
    userId?: string;
    eulaAccepted?: boolean;
    eulaVersion?: string;
    privacyNoticeAcknowledged?: boolean;
    privacyNoticeVersion?: string;
    uiLocale?: string;
  };
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

export function validatedUserName(value: unknown): string {
  if (typeof value !== "string") {
    throw new APIError("UNPROCESSABLE_ENTITY", {
      code: "INVALID_USER_NAME",
      message: "A valid name is required.",
    });
  }
  const normalized = normalizeName(value);
  const problem = validateName(normalized);
  if (problem) {
    throw new APIError("UNPROCESSABLE_ENTITY", {
      code: "INVALID_USER_NAME",
      message: problem,
    });
  }
  return normalized;
}

export const guardHook = createAuthMiddleware(async (ctx) => {
  const c = ctx as unknown as GuardCtx;

  if (
    c.body?.name !== undefined &&
    ["/sign-up/email", "/update-user", "/admin/create-user", "/admin/update-user"].includes(
      c.path,
    )
  ) {
    c.body.name = validatedUserName(c.body.name);
  }

  if (c.path === "/sign-up/email") {
    const { CURRENT_EULA_VERSION, CURRENT_PRIVACY_NOTICE_VERSION } =
      await import("./legal-documents");
    if (
      c.body?.eulaAccepted !== true ||
      c.body.eulaVersion !== CURRENT_EULA_VERSION ||
      c.body.privacyNoticeAcknowledged !== true ||
      c.body.privacyNoticeVersion !== CURRENT_PRIVACY_NOTICE_VERSION ||
      (c.body.uiLocale !== "en" && c.body.uiLocale !== "ar")
    ) {
      throw new APIError("UNPROCESSABLE_ENTITY", {
        code: "LEGAL_ACCEPTANCE_REQUIRED",
        message:
          "Accept the current EULA and acknowledge the current Privacy Notice before creating an account.",
      });
    }
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
