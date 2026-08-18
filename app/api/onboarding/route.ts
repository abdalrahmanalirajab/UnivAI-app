import { getOnboardingState } from "@/lib/onboarding";
import { getStartDestination } from "@/lib/onboarding-flow";
import { requireStudentApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireStudentApi();
  if (gate instanceof Response) return gate;

  const state = await getOnboardingState(gate);
  return Response.json({ ...state, destination: getStartDestination(state) });
}
