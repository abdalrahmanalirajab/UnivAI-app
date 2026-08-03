import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/session";
import { approveProgramme } from "@/lib/programmes";

export const dynamic = "force-dynamic";

function parseProgrammeId(params: { programmeId: string }): number | null {
  const id = Number(params.programmeId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ programmeId: string }> },
) {
  // Authorization comes ONLY from the server session (auth.api.getSession via
  // requireUserApi). Nothing client-sent is ever trusted for authorization:
  // the session's studentId scopes every query, and the client-sent
  // planVersion is used solely as the optimistic-concurrency check required
  // for exact-version approval — never as an authorization signal. Any other
  // client-sent user id, name, or status field in the body is ignored.
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  const { programmeId: raw } = await params;
  const programmeId = parseProgrammeId({ programmeId: raw });
  if (!programmeId) {
    return Response.json({ error: "Invalid programme ID." }, { status: 400 });
  }

  let body: { planVersion?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Only planVersion is read from the body; all other fields are ignored.
  const { planVersion } = body;
  if (typeof planVersion !== "number" || !Number.isInteger(planVersion) || planVersion < 1) {
    return Response.json(
      { error: "planVersion must be a positive integer." },
      { status: 400 },
    );
  }

  const result = await approveProgramme(programmeId, gate.studentId, planVersion);

  if (!result.ok) {
    // Conflicts carry the newest version's data (result.current includes the
    // current plan_version), never just a bare error code.
    const status = result.error === "Programme not found." ? 404 : 409;
    return Response.json(
      { error: result.error, current: result.current },
      { status },
    );
  }

  // Names the exact approved version alongside the full programme so callers
  // can verify which version was approved and refresh against the newest
  // state. Re-approving the same version returns this identical response
  // (idempotent).
  return Response.json({
    programme: result.programme,
    approvedVersion: result.programme.plan_version,
  });
}
