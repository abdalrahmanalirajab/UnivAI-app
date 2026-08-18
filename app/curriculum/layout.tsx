import type { ReactNode } from "react";
import { requirePreparedSource } from "@/lib/session";

export default async function CurriculumLayout({ children }: { children: ReactNode }) {
  await requirePreparedSource("/curriculum");
  return children;
}
