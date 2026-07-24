import { createAuthMiddleware } from "better-auth/api";
import { pool } from "./db";

/**
 * Audit logging for privileged admin actions (docs/auth-plan.md §6). Wired as
 * Better Auth's global `hooks.after`, so it runs after every request; we only
 * act on the admin mutation endpoints below, and only when they SUCCEEDED
 * (a blocked call throws before producing `returned`, so it is never logged).
 *
 * The actor comes from the session the admin plugin already resolved; the
 * target + change come from the request body. Logging never throws — a broken
 * audit write must not break the action it is recording.
 */
const AUDITED: Record<string, string> = {
  "/admin/set-role": "set-role",
  "/admin/ban-user": "ban-user",
  "/admin/unban-user": "unban-user",
  "/admin/remove-user": "remove-user",
};

type AfterCtx = {
  path: string;
  body?: { userId?: string; role?: string | string[]; banReason?: string };
  context: {
    session?: { user?: { id?: string; email?: string } } | null;
    returned?: unknown;
  };
};

export const auditHook = createAuthMiddleware(async (ctx) => {
  const c = ctx as unknown as AfterCtx;
  const action = AUDITED[c.path];
  if (!action) return;

  // Only record completed changes. set-role/ban/unban return { user }; remove
  // returns { success: true }. A forbidden attempt has neither.
  const returned = c.context.returned as
    | { user?: unknown; success?: boolean }
    | undefined;
  const succeeded =
    !!returned &&
    ((typeof returned === "object" && "user" in returned && !!returned.user) ||
      returned.success === true);
  if (!succeeded) return;

  const actor = c.context.session?.user;
  const body = c.body ?? {};

  try {
    await pool.query(
      `INSERT INTO auth_audit (action, actor_id, actor_email, target_id, detail)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        action,
        actor?.id ?? null,
        actor?.email ?? null,
        body.userId ?? null,
        JSON.stringify({
          role: body.role ?? null,
          banReason: body.banReason ?? null,
        }),
      ]
    );
  } catch (err) {
    console.error("auth_audit insert failed:", err);
  }
});
