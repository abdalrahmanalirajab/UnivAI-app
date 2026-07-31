import { getOnboardingState } from "@/lib/onboarding";
import { getStartDestination } from "@/lib/onboarding-flow";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  const state = await getOnboardingState(gate);
  return Response.json({ ...state, destination: getStartDestination(state) });
}
