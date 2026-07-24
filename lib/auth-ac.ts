import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

/**
 * Access control for the three roles (docs/auth-plan.md §6). Isomorphic — no
 * server-only deps, so lib/auth.ts (server) and lib/auth-client.ts (browser)
 * both import it and stay in sync.
 *
 * These statements are ENFORCED by the admin plugin's built-in endpoints: e.g.
 * POST /admin/set-role checks `user:["set-role"]` and throws FORBIDDEN without
 * it (see better-auth/dist/plugins/admin/routes.mjs). That is how we make role
 * escalation super_admin-only without a hand-written guard.
 *
 * Full admin statement vocabulary (from better-auth):
 *   user:    create, list, set-role, ban, impersonate, delete,
 *            set-password, set-email, get, update
 *   session: list, revoke, delete
 */
export const ac = createAccessControl(defaultStatements);

// student: an ordinary learner — no admin abilities at all.
export const student = ac.newRole({ user: [], session: [] });

// admin: day-to-day user management — list, ban/unban, reset a password, view
// and edit profiles — but NOT role changes, deletes, impersonation, or email
// changes. (docs/auth-plan.md §6 permission matrix.)
export const adminRole = ac.newRole({
  user: ["list", "ban", "set-password", "get", "update"],
  session: ["list", "revoke"],
});

// super_admin: everything, including escalating a student to admin (set-role),
// deleting users, and revoking any session.
export const superAdmin = ac.newRole({
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "delete",
    "set-password",
    "set-email",
    "get",
    "update",
  ],
  session: ["list", "revoke", "delete"],
});

export const roles = { student, admin: adminRole, super_admin: superAdmin };
