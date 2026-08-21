import { requireDeveloper } from "@/lib/session";

export default async function DeveloperLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireDeveloper();
  return <>{children}</>;
}
