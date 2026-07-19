import { query } from "./db";
import { now, MINUTE_MS, DAY_MS } from "./clock";

/**
 * Attendance — TRACKING ONLY in MVP-1. No penalties, no enforcement, no
 * certificate impact. We record what happened; policy comes in a later MVP.
 */

/** Joining within this window after starts_at still counts as on time. */
export const GRACE_MINUTES = 5;
/** Never joined by starts_at + this → absent. Derived at read time, no cron. */
export const ABSENT_AFTER_HOURS = 24;

export type AttendanceStatus = "on_time" | "late" | "absent" | "upcoming";

export type LectureAttendance = {
  lectureId: number;
  week: number;
  title: string;
  startsAt: Date;
  status: AttendanceStatus;
  joinedAt: Date | null;
  lateMinutes: number;
};

type Row = {
  id: number;
  week: number;
  title: string;
  starts_at: Date;
  joined_at: Date | null;
  status: string | null;
  late_minutes: number | null;
};

/**
 * Stamp a join. Called when the student actually enters the LiveKit room.
 * Idempotent: the first join for a lecture wins (re-joining never rewrites it).
 */
export async function stampJoin(lectureId: number): Promise<LectureAttendance | null> {
  const virtualNow = await now();

  const lectures = await query<{ id: number; starts_at: Date }>(
    "SELECT id, starts_at FROM lectures WHERE id = $1",
    [lectureId]
  );
  const lecture = lectures[0];
  if (!lecture) return null;

  const startsAt = new Date(lecture.starts_at);
  const minutesPastStart = Math.max(
    0,
    Math.floor((virtualNow.getTime() - startsAt.getTime()) / MINUTE_MS)
  );
  const isLate = minutesPastStart > GRACE_MINUTES;

  await query(
    `INSERT INTO attendance (lecture_id, joined_at, status, late_minutes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (lecture_id) DO NOTHING`,
    [lectureId, virtualNow, isLate ? "late" : "on_time", isLate ? minutesPastStart : 0]
  );

  const all = await getAttendance();
  return all.find((a) => a.lectureId === lectureId) ?? null;
}

/** Full attendance record. 'absent' and 'upcoming' are derived, never stored. */
export async function getAttendance(): Promise<LectureAttendance[]> {
  const virtualNow = await now();
  const rows = await query<Row>(
    `SELECT l.id, l.week, l.title, l.starts_at,
            a.joined_at, a.status, a.late_minutes
       FROM lectures l
       LEFT JOIN attendance a ON a.lecture_id = l.id
      ORDER BY l.week ASC`
  );

  return rows.map((row) => {
    const startsAt = new Date(row.starts_at);
    let status: AttendanceStatus;

    if (row.joined_at) {
      status = row.status === "late" ? "late" : "on_time";
    } else if (
      virtualNow.getTime() >
      startsAt.getTime() + ABSENT_AFTER_HOURS * (DAY_MS / 24)
    ) {
      status = "absent";
    } else {
      status = "upcoming";
    }

    return {
      lectureId: row.id,
      week: row.week,
      title: row.title,
      startsAt,
      status,
      joinedAt: row.joined_at ? new Date(row.joined_at) : null,
      lateMinutes: row.late_minutes ?? 0,
    };
  });
}

export type AttendanceSummary = {
  onTimeCount: number;
  lateCount: number;
  absentCount: number;
  upcomingCount: number;
  totalLateMinutes: number;
  averageLateMinutes: number;
};

export function summarize(records: LectureAttendance[]): AttendanceSummary {
  const late = records.filter((r) => r.status === "late");
  const totalLateMinutes = late.reduce((sum, r) => sum + r.lateMinutes, 0);
  return {
    onTimeCount: records.filter((r) => r.status === "on_time").length,
    lateCount: late.length,
    absentCount: records.filter((r) => r.status === "absent").length,
    upcomingCount: records.filter((r) => r.status === "upcoming").length,
    totalLateMinutes,
    averageLateMinutes: late.length
      ? Math.round((totalLateMinutes / late.length) * 10) / 10
      : 0,
  };
}
