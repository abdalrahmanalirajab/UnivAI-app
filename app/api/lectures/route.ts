import {
  approvedPlanVersion,
  approvedCourseSchedule,
  BLOCKED_MESSAGE,
  getLectures,
  getSections,
  readScript,
  ScheduleIntegrityError,
} from "@/lib/lectures";
import { getAttendance } from "@/lib/attendance";
import { getApprovedLectureMakeups } from "@/lib/lecture-makeup";
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
    const [sections, attendance, makeups, planVersion, schedule, book] = await Promise.all([
      getSections(sid),
      getAttendance(sid),
      getApprovedLectureMakeups(sid),
      approvedPlanVersion(sid),
      approvedCourseSchedule(sid),
      query<{ status: string; error: string | null }>(
        `SELECT status, error FROM books WHERE student_id = $1 ORDER BY id DESC LIMIT 1`,
        [sid],
      ),
    ]);

    const detailed = await Promise.all(
      lectures.map(async (lecture) => {
        const script = await readScript(sid, lecture.week);
        const record = attendance.find((a) => a.lectureId === lecture.id);
        const makeup = makeups.get(lecture.id) ?? null;
        const effectiveStartsAt = makeup?.startedAt ?? lecture.startsAt;
        const effectiveCutoffAt = makeup?.firstJoinCutoffAt ?? lecture.joinCutoffAt;
        const effectiveEndsAt = makeup?.endsAt ?? lecture.endsAt;
        const state = makeup?.state === "active" ? "live" : lecture.state;
        const joinable = lecture.joinable || makeup?.state === "active";
        const makeupBlockedMessage = makeup?.state === "expired"
          ? "Your one-time make-up start window closed before you joined."
          : makeup?.state === "completed"
            ? "Your one-time make-up lecture is complete and cannot be replayed."
            : null;
        return {
          id: lecture.id,
          session_type: "lecture" as const,
          week: lecture.week,
          title: lecture.title,
          startsAt: effectiveStartsAt.toISOString(),
          joinCutoffAt: effectiveCutoffAt.toISOString(),
          endsAt: effectiveEndsAt.toISOString(),
          state,
          joinable,
          completed: lecture.completed,
          archiveAvailable: lecture.completed && !makeup,
          makeup: makeup ? {
            state: makeup.state,
            startedAt: makeup.startedAt?.toISOString() ?? null,
            firstJoinCutoffAt: makeup.firstJoinCutoffAt?.toISOString() ?? null,
          } : null,
          blockedMessage: makeupBlockedMessage ?? (
            !makeup && lecture.blockedReason ? BLOCKED_MESSAGE[lecture.blockedReason] : null
          ),
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
      schedule,
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
