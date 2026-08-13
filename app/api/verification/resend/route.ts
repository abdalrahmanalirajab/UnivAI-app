import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireUserApi } from "@/lib/session";
import { enforceUserRateLimit } from "@/lib/rate-limits";

export async function POST() {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "account");
  if (limited) return limited;

  if (gate.emailVerified) {
    return Response.json({ sent: true });
  }

  await auth.api.sendVerificationEmail({
    body: { email: gate.email, callbackURL: "/subscribe" },
    headers: await headers(),
  });

  return Response.json({ sent: true });
}
