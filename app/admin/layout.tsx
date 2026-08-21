import { requireAdmin } from "@/lib/session";
import { Suspense } from "react";

/**
 * Gates every /admin/* page at the server, before any admin UI renders. The
 * SUDO panel (app/admin/page.tsx) is a client component and can't check the
 * session itself, so this server layout is the real boundary. Middleware only
 * guarantees a session cookie exists; this checks the role.
 *
 * Admin-vs-super_admin is enforced per-page: the super_admin-only user
 * management page (/admin/users) additionally calls requireSuperAdmin().
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();
  return <Suspense fallback={null}>{children}</Suspense>;
}
