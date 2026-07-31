import { requirePreparedSource } from "@/lib/session";

export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  await requirePreparedSource("/library");
  return children;
}
