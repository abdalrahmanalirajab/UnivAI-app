import { query } from "@/lib/db";
import { getAttendance, summarize } from "@/lib/attendance";

export const dynamic = "force-dynamic";

/** Everything the student's dashboard shows: attendance, lateness, grades. */
export async function GET() {
  const attendance = await getAttendance();

  const grades = await query<{
    id: number;
    kind: string;
    week: number | null;
    score: string;
    max_score: string;
    feedback: string | null;
    flagged: boolean;
  }>(
    "SELECT id, kind, week, score, max_score, feedback, flagged FROM grades ORDER BY week ASC NULLS LAST, id ASC"
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
  });
}
