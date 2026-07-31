import { getLectures, readScript, BLOCKED_MESSAGE } from "@/lib/lectures";
import { getAttendance } from "@/lib/attendance";
import { requirePreparedSourceApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The 4-week schedule, each lecture with its slide count and attendance record. */
export async function GET() {
  const gate = await requirePreparedSourceApi();
  if (gate instanceof Response) return gate;
  const sid = gate.studentId;

  const [lectures, attendance] = await Promise.all([getLectures(sid), getAttendance(sid)]);

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

  return Response.json({ lectures: detailed });
}
