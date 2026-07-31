import { redirect } from "next/navigation";
import { getOnboardingState } from "@/lib/onboarding";
import { requireUser } from "@/lib/session";

export default async function UploadLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/upload");
  const state = await getOnboardingState(user);
  if (state.hasPreparedSource) redirect("/library");
  return children;
}
