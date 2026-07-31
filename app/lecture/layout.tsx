import { requireLearningAction } from "@/lib/session";

export default async function LectureLayout({ children }: { children: React.ReactNode }) {
  await requireLearningAction("/lecture");
  return children;
}
