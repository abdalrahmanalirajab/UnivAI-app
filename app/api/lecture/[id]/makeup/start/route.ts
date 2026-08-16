import { NextRequest } from "next/server";
import { startLectureMakeup } from "@/lib/lecture-makeup";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import { requireLearningActionApi } from "@/lib/session";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "live");
  if (limited) return limited;

  const { id } = await context.params;
  if (!UUID.test(id)) {
    return Response.json({ error: "No such lecture." }, { status: 404 });
  }

  const makeup = await startLectureMakeup(gate.registrationNumber, id);
  if (!makeup) {
    return Response.json(
      { error: "No administrator-approved make-up is available for this lecture." },
      { status: 403 },
    );
  }
  if (makeup.state === "completed" || makeup.state === "expired") {
    return Response.json(
      {
        error: makeup.state === "completed"
          ? "This one-time make-up lecture is already complete."
          : "This one-time make-up lecture has closed and cannot be restarted.",
        code: "MAKEUP_CLOSED",
        makeup: { state: makeup.state },
      },
      { status: 409 },
    );
  }
  if (makeup.state !== "active") {
    return Response.json(
      { error: "The make-up lecture could not be started.", code: "MAKEUP_NOT_STARTED" },
      { status: 409 },
    );
  }

  return Response.json({
    makeup: {
      state: makeup.state,
      startedAt: makeup.startedAt?.toISOString() ?? null,
      firstJoinCutoffAt: makeup.firstJoinCutoffAt?.toISOString() ?? null,
    },
  });
}
