import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireUserApi } from "@/lib/session";

export async function POST() {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  if (gate.emailVerified) {
    return Response.json({ sent: true });
  }

  await auth.api.sendVerificationEmail({
    body: { email: gate.email, callbackURL: "/start" },
    headers: await headers(),
  });

  return Response.json({ sent: true });
}
