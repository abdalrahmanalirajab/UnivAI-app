import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { now } from "@/lib/clock";
import { requireLearningActionApi } from "@/lib/session";
import { enforceUserRateLimit } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";

/**
 * Idempotent completion acknowledgement from the lecture UI. The trusted Live
 * worker normally persists completion first; this endpoint can only close an
 * attendance row whose durable checkpoint already reached every sentence.
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "live");
  if (limited) return limited;
  const sid = gate.registrationNumber;

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: "No such lecture." }, { status: 404 });
  }
  const finishedAt = await now();

  const updated = await query(
    `UPDATE attendance a
        SET completed_at = $1, is_connected = FALSE
      FROM lectures l
      WHERE a.lecture_id = l.id AND l.public_id = $2::uuid
        AND a.student_id = $3 AND l.student_id = $3
        AND a.completed_at IS NULL
        AND a.total_sentences > 0
        AND a.last_sentence_index >= a.total_sentences
      RETURNING a.id`,
    [finishedAt, id, sid]
  );

  return Response.json({ completed: updated.length > 0, at: finishedAt.toISOString() });
}
