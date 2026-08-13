import { requireSuperAdmin } from "@/lib/session";

export default async function AdminUsersLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();
  return children;
}
