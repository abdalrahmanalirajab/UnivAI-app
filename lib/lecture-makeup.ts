import "server-only";

import { now, MINUTE_MS } from "./clock";
import { query } from "./db";
import { scriptDurationMinutes, type DurationBearingScript } from "./lecture-duration";

export type LectureMakeupState = "ready" | "active" | "completed" | "expired";

export type LectureMakeupAccess = {
  itemId: string;
  lectureId: string;
  week: number;
  title: string;
  state: LectureMakeupState;
  startedAt: Date | null;
  firstJoinCutoffAt: Date | null;
  endsAt: Date | null;
};

type MakeupRow = {
  item_id: string;
  lecture_public_id: string;
  week: number;
  title: string;
  makeup_started_at: Date | null;
  joined_at: Date | null;
  completed_at: Date | null;
  script_payload: DurationBearingScript;
};

function mapMakeup(row: MakeupRow, virtualNow: Date): LectureMakeupAccess {
  const startedAt = row.makeup_started_at ? new Date(row.makeup_started_at) : null;
  const durationMinutes = scriptDurationMinutes(row.script_payload);
  const firstJoinCutoffAt = startedAt
    ? new Date(startedAt.getTime() + (durationMinutes / 2) * MINUTE_MS)
    : null;
  const endsAt = startedAt
    ? new Date(startedAt.getTime() + durationMinutes * MINUTE_MS)
    : null;

  let state: LectureMakeupState = "ready";
  if (row.completed_at) state = "completed";
  else if (startedAt && row.joined_at) state = "active";
  else if (firstJoinCutoffAt && virtualNow > firstJoinCutoffAt) state = "expired";
  else if (startedAt) state = "active";

  return {
    itemId: row.item_id,
    lectureId: row.lecture_public_id,
    week: row.week,
    title: row.title,
    state,
    startedAt,
    firstJoinCutoffAt,
    endsAt,
  };
}

/** Final admin-approved, one-time interactive make-up lectures for one learner. */
export async function getApprovedLectureMakeups(
  studentId: string,
): Promise<Map<string, LectureMakeupAccess>> {
  const [virtualNow, rows] = await Promise.all([
    now(),
    query<MakeupRow>(
      `SELECT DISTINCT ON (item.lecture_public_id)
              item.id::text AS item_id,
              item.lecture_public_id::text AS lecture_public_id,
              item.week,
              lecture.title,
              item.makeup_started_at,
              attendance.joined_at,
              attendance.completed_at,
              artifact.script_payload
         FROM absence_case_items AS item
         JOIN absence_cases AS absence_case
           ON absence_case.id = item.case_id
          AND absence_case.student_id = item.student_id
         JOIN lectures AS lecture
           ON lecture.public_id = item.lecture_public_id
          AND lecture.student_id = item.student_id
         LEFT JOIN attendance
           ON attendance.lecture_id = lecture.id
          AND attendance.student_id = item.student_id
         LEFT JOIN lecture_artifacts AS artifact
           ON artifact.artifact_id = lecture.lecture_artifact_id
        WHERE item.student_id = $1
          AND item.item_type = 'lecture'
          AND item.lecture_public_id IS NOT NULL
          AND item.remedy = 'makeup_live'
          AND absence_case.status = 'approved'
        ORDER BY item.lecture_public_id, absence_case.decided_at DESC NULLS LAST,
                 item.created_at DESC`,
      [studentId],
    ),
  ]);
  return new Map(rows.map((row) => {
    const access = mapMakeup(row, virtualNow);
    return [access.lectureId, access];
  }));
}

export async function getLectureMakeupAccess(
  studentId: string,
  lectureId: string,
): Promise<LectureMakeupAccess | null> {
  return (await getApprovedLectureMakeups(studentId)).get(lectureId) ?? null;
}

/**
 * Consume the learner's one start confirmation. Repeated requests are
 * idempotent and never reset the effective start time.
 */
export async function startLectureMakeup(
  studentId: string,
  lectureId: string,
): Promise<LectureMakeupAccess | null> {
  const startedAt = await now();
  await query(
    `UPDATE absence_case_items AS item
        SET makeup_started_at = $3
       FROM absence_cases AS absence_case
      WHERE item.case_id = absence_case.id
        AND absence_case.student_id = item.student_id
        AND item.student_id = $1
        AND item.lecture_public_id = $2::uuid
        AND item.item_type = 'lecture'
        AND item.remedy = 'makeup_live'
        AND item.makeup_started_at IS NULL
        AND absence_case.status = 'approved'
        AND NOT EXISTS (
          SELECT 1
            FROM lectures AS lecture
            JOIN attendance
              ON attendance.lecture_id = lecture.id
             AND attendance.student_id = lecture.student_id
           WHERE lecture.public_id = item.lecture_public_id
             AND lecture.student_id = item.student_id
             AND attendance.completed_at IS NOT NULL
        )
      RETURNING item.id`,
    [studentId, lectureId, startedAt],
  );
  return getLectureMakeupAccess(studentId, lectureId);
}
