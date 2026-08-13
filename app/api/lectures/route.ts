import {
  approvedPlanVersion,
  BLOCKED_MESSAGE,
  getLectures,
  getSections,
  readScript,
  ScheduleIntegrityError,
} from "@/lib/lectures";
import { getAttendance } from "@/lib/attendance";
import { query } from "@/lib/db";
import { requirePreparedSourceApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The approved-plan schedule, each lecture with its slide count and attendance record. */
export async function GET() {
  const gate = await requirePreparedSourceApi();
  if (gate instanceof Response) return gate;
  const sid = gate.registrationNumber;

  try {
    const lectures = await getLectures(sid);
    const [sections, attendance, planVersion, book] = await Promise.all([
      getSections(sid),
      getAttendance(sid),
      approvedPlanVersion(sid),
      query<{ status: string; error: string | null }>(
        `SELECT status, error FROM books WHERE student_id = $1 ORDER BY id DESC LIMIT 1`,
        [sid],
      ),
    ]);

    const detailed = await Promise.all(
      lectures.map(async (lecture) => {
        const script = await readScript(sid, lecture.week);
        const record = attendance.find((a) => a.lectureId === lecture.id);
        return {
          id: lecture.id,
          session_type: "lecture" as const,
          week: lecture.week,
          title: lecture.title,
          startsAt: lecture.startsAt.toISOString(),
          joinCutoffAt: lecture.joinCutoffAt.toISOString(),
          endsAt: lecture.endsAt.toISOString(),
          state: lecture.state,
          joinable: lecture.joinable,
          completed: lecture.completed,
          archiveAvailable: lecture.state === "done",
          blockedMessage: lecture.blockedReason
            ? BLOCKED_MESSAGE[lecture.blockedReason]
            : null,
          slides: script?.segments.length ?? 0,
          attendance: record
            ? {
                status: record.status,
                joinedAt: record.joinedAt?.toISOString() ?? null,
                lateMinutes: record.lateMinutes,
                attendanceStatus: record.attendanceStatus,
                attendancePercentage: record.attendancePercentage,
                attendedLectureMinutes: record.attendedLectureMinutes,
                connectedSeconds: record.connectedSeconds,
                isConnected: record.isConnected,
                inProgress: record.inProgress,
                disconnectCount: record.disconnectCount,
              }
            : null,
        };
      }),
    );

    const records = detailed.flatMap((lecture) => [
      lecture,
      ...sections
        .filter((section) => section.week === lecture.week)
        .map((section) => ({
          ...section,
          startsAt: section.startsAt.toISOString(),
        })),
    ]);

    return Response.json({
      lectures: records,
      planVersion,
      generation: book[0] ? { status: book[0].status, error: book[0].error } : null,
    });
  } catch (error) {
    if (error instanceof ScheduleIntegrityError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 409 },
      );
    }
    console.error("Could not load schedule", error);
    return Response.json({ error: "Could not load the schedule." }, { status: 500 });
  }
}
