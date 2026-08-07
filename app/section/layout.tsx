import type { ReactNode } from "react";
import { requireLearningAction } from "@/lib/session";

export default async function SectionLayout({ children }: { children: ReactNode }) {
  await requireLearningAction("/schedule");
  return children;
}
