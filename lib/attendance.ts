import { query } from "./db";
import { now, MINUTE_MS } from "./clock";
import { scriptDurationMinutes, type DurationBearingScript } from "./lecture-duration";
import {
  classifyParticipation,
  lectureCoveragePercent,
  type ParticipationStatus,
} from "./attendance-policy";

/** Attendance arrival, live presence, lecture coverage, and policy read model. */

/** A worker heartbeat arrives every 3 seconds; allow several missed beats. */
export const PRESENCE_STALE_SECONDS = 15;

export type AttendanceStatus = "on_time" | "late" | "absent" | "upcoming";

export type LectureAttendance = {
  lectureId: string;
  week: number;
  title: string;
  startsAt: Date;
  status: AttendanceStatus;
  joinedAt: Date | null;
  lateMinutes: number;
  completedAt: Date | null;
  attendanceStatus: ParticipationStatus;
  attendancePercentage: number;
  attendedLectureMinutes: number;
  connectedSeconds: number;
  isConnected: boolean;
  inProgress: boolean;
  disconnectCount: number;
  lastDisconnectedAt: Date | null;
};

type Row = {
  id: number;
  public_id: string;
  week: number;
  title: string;
  starts_at: Date;
  joined_at: Date | null;
  status: string | null;
  late_minutes: number | null;
  completed_at: Date | null;
  attended_seconds: number | string | null;
  is_connected: boolean | null;
  presence_last_seen_at: Date | null;
  last_disconnected_at: Date | null;
  disconnect_count: number | null;
  last_sentence_index: number | null;
  total_sentences: number | null;
  script_payload: DurationBearingScript;
};

/** Full attendance record for one student. 'absent'/'upcoming' are derived. */
export async function getAttendance(sid: string): Promise<LectureAttendance[]> {
  const virtualNow = await now();
  const rows = await query<Row>(
    `SELECT l.id, l.public_id::text AS public_id, l.week, l.title, l.starts_at,
            a.joined_at, a.status, a.late_minutes, a.completed_at,
            a.attended_seconds, a.is_connected, a.presence_last_seen_at,
            a.last_disconnected_at, a.disconnect_count,
            a.last_sentence_index, a.total_sentences,
            la.script_payload
       FROM lectures l
       LEFT JOIN attendance a ON a.lecture_id = l.id AND a.student_id = $1
       LEFT JOIN lecture_artifacts la ON la.artifact_id = l.lecture_artifact_id
      WHERE l.student_id = $1
      ORDER BY l.week ASC`,
    [sid]
  );

  return rows.map((row) => {
    const startsAt = new Date(row.starts_at);
    const scheduledMinutes = scriptDurationMinutes(row.script_payload);
    const firstJoinCutoff = new Date(
      startsAt.getTime() + (scheduledMinutes / 2) * MINUTE_MS,
    );
    let status: AttendanceStatus;

    if (row.joined_at) {
      status = row.status === "late" ? "late" : "on_time";
    } else if (virtualNow > firstJoinCutoff) {
      status = "absent";
    } else {
      status = "upcoming";
    }

    const joinedAt = row.joined_at ? new Date(row.joined_at) : null;
    const completedAt = row.completed_at ? new Date(row.completed_at) : null;
    const rawAttendancePercentage = lectureCoveragePercent({
      nextSentenceIndex: row.last_sentence_index ?? 0,
      totalSentences: row.total_sentences ?? 0,
      completed: Boolean(completedAt),
    });
    const attendanceStatus = classifyParticipation(rawAttendancePercentage, {
      upcoming: !joinedAt && status === "upcoming",
    });
    const attendancePercentage = Math.round(rawAttendancePercentage * 10) / 10;
    const lastSeenAt = row.presence_last_seen_at
      ? new Date(row.presence_last_seen_at)
      : null;
    const heartbeatAgeMs = lastSeenAt
      ? virtualNow.getTime() - lastSeenAt.getTime()
      : Number.POSITIVE_INFINITY;

    return {
      lectureId: row.public_id,
      week: row.week,
      title: row.title,
      startsAt,
      status,
      joinedAt,
      lateMinutes: row.late_minutes ?? 0,
      completedAt,
      attendanceStatus,
      attendancePercentage,
      attendedLectureMinutes:
        Math.round(scheduledMinutes * (attendancePercentage / 100) * 10) / 10,
      connectedSeconds: Math.max(0, Math.round(Number(row.attended_seconds ?? 0))),
      isConnected: Boolean(
        row.is_connected &&
          !completedAt &&
          lastSeenAt &&
          (heartbeatAgeMs < 0 || heartbeatAgeMs <= PRESENCE_STALE_SECONDS * 1_000),
      ),
      inProgress: Boolean(joinedAt && !completedAt),
      disconnectCount: row.disconnect_count ?? 0,
      lastDisconnectedAt: row.last_disconnected_at
        ? new Date(row.last_disconnected_at)
        : null,
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
  attendedCount: number;
  partiallyAttendedCount: number;
  participationAbsentCount: number;
  inProgressCount: number;
  connectedCount: number;
  averageAttendancePercentage: number;
};

export function summarize(records: LectureAttendance[]): AttendanceSummary {
  const late = records.filter((r) => r.status === "late");
  const totalLateMinutes = late.reduce((sum, r) => sum + r.lateMinutes, 0);
  const participationRecords = records.filter(
    (record) => record.attendanceStatus !== "upcoming",
  );
  const totalAttendancePercentage = participationRecords.reduce(
    (sum, record) => sum + record.attendancePercentage,
    0,
  );
  return {
    onTimeCount: records.filter((r) => r.status === "on_time").length,
    lateCount: late.length,
    absentCount: records.filter((r) => r.status === "absent").length,
    upcomingCount: records.filter((r) => r.status === "upcoming").length,
    totalLateMinutes,
    averageLateMinutes: late.length
      ? Math.round((totalLateMinutes / late.length) * 10) / 10
      : 0,
    attendedCount: records.filter((record) => record.attendanceStatus === "attended").length,
    partiallyAttendedCount: records.filter(
      (record) => record.attendanceStatus === "partially_attended",
    ).length,
    participationAbsentCount: records.filter(
      (record) => record.attendanceStatus === "absent",
    ).length,
    inProgressCount: records.filter((record) => record.inProgress).length,
    connectedCount: records.filter((record) => record.isConnected).length,
    averageAttendancePercentage: participationRecords.length
      ? Math.round((totalAttendancePercentage / participationRecords.length) * 10) / 10
      : 0,
  };
}
