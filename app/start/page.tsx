import { redirect } from "next/navigation";
import { getOnboardingState } from "@/lib/onboarding";
import { getStartDestination } from "@/lib/onboarding-flow";
import { requireStudent } from "@/lib/session";

export default async function StartPage() {
  const user = await requireStudent("/start");
  const state = await getOnboardingState(user);
  redirect(getStartDestination(state));
}
