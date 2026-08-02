import { requireLearningAction } from "@/lib/session";
import { isStandalone } from "@/lib/runtime";

export default async function LectureLayout({ children }: { children: React.ReactNode }) {
  if (!isStandalone()) await requireLearningAction("/lecture");
  return children;
}
