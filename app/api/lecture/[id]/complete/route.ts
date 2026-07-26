import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { now } from "@/lib/clock";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The Lecturer agent reached the end of the script and the student was there for
 * it. A finished lecture cannot be reopened, so this is what closes the door.
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;
  const sid = gate.studentId;

  const { id } = await context.params;
  const lectureId = Number(id);
  const finishedAt = await now();

  const updated = await query(
    `UPDATE attendance SET completed_at = $1
      WHERE lecture_id = $2 AND student_id = $3 AND completed_at IS NULL
      RETURNING id`,
    [finishedAt, lectureId, sid]
  );

  return Response.json({ completed: updated.length > 0, at: finishedAt.toISOString() });
}
