import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { now } from "@/lib/clock";
import { resolveWeek } from "@/lib/exams";

export const dynamic = "force-dynamic";

/**
 * The exam system POSTs here after every submission: the grade plus the
 * proctoring report (suspicion score, flagged, events). We store both, so the
 * dashboard shows the score and the admin can judge whether the attempt has a
 * problem.
 */
export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  if (!payload?.exam_id) {
    return Response.json({ error: "exam_id is required" }, { status: 400 });
  }

  const { kind, week } = await resolveWeek(payload);
  const takenAt = await now();

  const flagged =
    Boolean(payload.report?.flagged) || payload.integrity_status === "invalidated";
  const feedback = payload.passed
    ? "Passed."
    : payload.integrity_status === "invalidated"
      ? "Invalidated by proctoring."
      : "Below the pass mark.";

  await query(
    `INSERT INTO grades (kind, week, score, max_score, feedback, taken_at, exam_id, flagged, report)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (exam_id) DO UPDATE SET
       score = EXCLUDED.score,
       max_score = EXCLUDED.max_score,
       feedback = EXCLUDED.feedback,
       taken_at = EXCLUDED.taken_at,
       flagged = EXCLUDED.flagged,
       report = EXCLUDED.report`,
    [
      kind,
      week,
      payload.mark ?? 0,
      payload.total_questions ?? 0,
      feedback,
      takenAt,
      payload.exam_id,
      flagged,
      JSON.stringify(payload.report ?? {}),
    ]
  );

  console.log(
    `[exams] result recorded: ${kind}${week ? ` week ${week}` : ""} ` +
      `mark=${payload.mark}/${payload.total_questions} flagged=${flagged}`
  );
  return Response.json({ ok: true });
}
