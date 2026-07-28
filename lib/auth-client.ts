import { createAuthClient } from "better-auth/react";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import type { Auth } from "./auth";
import { ac, roles } from "./auth-ac";

/**
 * The ONE client Dev B imports (docs/auth-contract.md §1). Nobody imports
 * `better-auth` directly from a page — if the library's API drifts, it changes
 * here and the pages don't. `inferAdditionalFields<Auth>()` teaches the client
 * about `phone`/`studentId`; `adminClient()` adds `authClient.admin.*`.
 *
 * `import type { Auth }` is erased at build time, so no server-only code from
 * lib/auth.ts (pg, dotenv) is pulled into the browser bundle.
 */
export const authClient = createAuthClient({
  plugins: [adminClient({ ac, roles }), inferAdditionalFields<Auth>()],
});

export const { signIn, signUp, signOut, useSession } = authClient;

export type { SessionUser, Role } from "./auth-types";
export { isAdminRole, ADMIN_ROLES } from "./auth-types";
