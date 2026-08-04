import { redirect } from "next/navigation";
import { getOnboardingState } from "@/lib/onboarding";
import { requireVerifiedUser } from "@/lib/session";

export default async function UploadLayout({ children }: { children: React.ReactNode }) {
  const user = await requireVerifiedUser("/upload");
  const state = await getOnboardingState(user);
  if (state.hasPreparedSource) redirect("/library");
  return children;
}
