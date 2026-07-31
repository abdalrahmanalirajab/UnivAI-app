import { requirePreparedSource } from "@/lib/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requirePreparedSource("/dashboard");
  return children;
}
