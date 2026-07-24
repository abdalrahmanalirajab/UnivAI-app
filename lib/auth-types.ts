/**
 * The frozen auth shapes from docs/auth-contract.md (§3).
 *
 * Dev B renders these; changing any field here is a contract change (bump the
 * contract version and get both devs to sign off). `role` and `studentId` are
 * server-assigned — the client never sends them.
 */
export type Role = "student" | "admin" | "super_admin";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phone: string | null; // E.164, e.g. "+201234567890" — stored, NOT verified
  role: Role;
  studentId: string; // server-generated, e.g. "S-2026-000042" (RAG/LiveKit key)
  image: string | null;
  createdAt: string; // ISO 8601
};

export const ADMIN_ROLES: Role[] = ["admin", "super_admin"];

export function isAdminRole(role: string | undefined | null): boolean {
  return role === "admin" || role === "super_admin";
}
