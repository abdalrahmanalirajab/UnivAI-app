import { query } from "@/lib/db";
import { getAttendance, summarize } from "@/lib/attendance";
import { getFinalExamStatus } from "@/lib/exams";
import { requirePreparedSourceApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Everything the student's dashboard shows: attendance, lateness, grades. */
export async function GET() {
  const gate = await requirePreparedSourceApi();
  if (gate instanceof Response) return gate;
  const sid = gate.registrationNumber;

  const attendance = await getAttendance(sid);

  const grades = await query<{
    id: number;
    kind: string;
    week: number | null;
    score: string;
    max_score: string;
    feedback: string | null;
    flagged: boolean;
  }>(
    "SELECT id, kind, week, score, max_score, feedback, flagged FROM grades WHERE student_id = $1 ORDER BY week ASC NULLS LAST, id ASC",
    [sid]
  );

  return Response.json({
    attendance: attendance.map((record) => ({
      lectureId: record.lectureId,
      week: record.week,
      title: record.title,
      startsAt: record.startsAt.toISOString(),
      status: record.status,
      joinedAt: record.joinedAt?.toISOString() ?? null,
      lateMinutes: record.lateMinutes,
    })),
    summary: summarize(attendance),
    grades,
    // The same session-scoped, callback-populated status the exams page shows
    // (ExamServiceStatusV1) — one contract, two surfaces.
    final: await getFinalExamStatus(sid),
  });
}
