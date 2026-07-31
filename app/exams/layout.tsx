import { requireLearningAction } from "@/lib/session";

export default async function ExamsLayout({ children }: { children: React.ReactNode }) {
  await requireLearningAction("/exams");
  return children;
}
