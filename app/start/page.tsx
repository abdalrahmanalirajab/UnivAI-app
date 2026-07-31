import { redirect } from "next/navigation";
import { getOnboardingState } from "@/lib/onboarding";
import { getStartDestination } from "@/lib/onboarding-flow";
import { requireUser } from "@/lib/session";

export default async function StartPage() {
  const user = await requireUser("/start");
  const state = await getOnboardingState(user);
  redirect(getStartDestination(state));
}
