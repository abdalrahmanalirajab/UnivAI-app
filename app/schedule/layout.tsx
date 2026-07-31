import { requirePreparedSource } from "@/lib/session";

export default async function ScheduleLayout({ children }: { children: React.ReactNode }) {
  await requirePreparedSource("/schedule");
  return children;
}
