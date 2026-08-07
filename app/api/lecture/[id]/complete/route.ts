import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { now } from "@/lib/clock";
import { requireLearningActionApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The Lecturer agent reached the end of the script and the student was there for
 * it. A finished lecture cannot be reopened, so this is what closes the door.
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const sid = gate.studentId;

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: "No such lecture." }, { status: 404 });
  }
  const finishedAt = await now();

  const updated = await query(
    `UPDATE attendance a SET completed_at = $1
      FROM lectures l
      WHERE a.lecture_id = l.id AND l.public_id = $2::uuid
        AND a.student_id = $3 AND l.student_id = $3
        AND a.completed_at IS NULL
      RETURNING a.id`,
    [finishedAt, id, sid]
  );

  return Response.json({ completed: updated.length > 0, at: finishedAt.toISOString() });
}
