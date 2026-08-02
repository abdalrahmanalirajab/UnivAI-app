import { getLectures, readScript, BLOCKED_MESSAGE, approvedPlanVersion } from "@/lib/lectures";
import { getAttendance } from "@/lib/attendance";
import { query } from "@/lib/db";
import { requirePreparedSourceApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The approved-plan schedule, each lecture with its slide count and attendance record. */
export async function GET() {
  const gate = await requirePreparedSourceApi();
  if (gate instanceof Response) return gate;
  const sid = gate.studentId;

  const [lectures, attendance, planVersion, book] = await Promise.all([
    getLectures(sid),
    getAttendance(sid),
    approvedPlanVersion(sid),
    query<{ status: string; error: string | null }>(
      `SELECT status, error FROM books WHERE student_id = $1 ORDER BY id DESC LIMIT 1`,
      [sid]
    ),
  ]);

  const detailed = await Promise.all(
    lectures.map(async (lecture) => {
      const script = await readScript(sid, lecture.week);
      const record = attendance.find((a) => a.lectureId === lecture.id);
      return {
        id: lecture.id,
        week: lecture.week,
        title: lecture.title,
        startsAt: lecture.startsAt.toISOString(),
        joinCutoffAt: lecture.joinCutoffAt.toISOString(),
        endsAt: lecture.endsAt.toISOString(),
        state: lecture.state,
        joinable: lecture.joinable,
        completed: lecture.completed,
        blockedMessage: lecture.blockedReason
          ? BLOCKED_MESSAGE[lecture.blockedReason]
          : null,
        slides: script?.segments.length ?? 0,
        attendance: record
          ? {
              status: record.status,
              joinedAt: record.joinedAt?.toISOString() ?? null,
              lateMinutes: record.lateMinutes,
            }
          : null,
      };
    })
  );

  return Response.json({
    lectures: detailed,
    planVersion,
    generation: book[0] ? { status: book[0].status, error: book[0].error } : null,
  });
}
