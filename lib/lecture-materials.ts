import { now, MINUTE_MS } from "./clock";
import { queryOne } from "./db";
import { scriptDurationMinutes, type DurationBearingScript } from "./lecture-duration";

type LectureMaterialRow = {
  lecture_id: string;
  artifact_id: string | null;
  artifact_updated_at?: Date | null;
  week: number;
  title: string;
  starts_at: Date;
  joined_at: Date | null;
  completed_at: Date | null;
  script_payload: DurationBearingScript;
  replay_access_granted?: boolean;
};

export type LectureMaterialAccess = {
  lectureId: string;
  artifactId: string | null;
  artifactVersion: string | null;
  week: number;
  title: string;
  startsAt: Date;
  endsAt: Date;
  available: boolean;
  mode: "live" | "archive" | null;
  blockedReason: "not_started" | "not_joined" | null;
};

/**
 * Decide whether presentation bytes may be served without changing attendance.
 *
 * During the scheduled lecture, only a learner whose trusted token request has
 * already stamped a join may read them. At the scheduled end, the same slides
 * become a read-only archive even when the learner missed or skipped the live
 * lecture. A final administrator-approved replay remedy opens that same archive
 * immediately. Nothing in this path creates or updates an attendance row.
 */
export function lectureMaterialAccessAt(
  row: LectureMaterialRow,
  virtualNow: Date,
): LectureMaterialAccess {
  const startsAt = new Date(row.starts_at);
  const endsAt = new Date(
    startsAt.getTime() + scriptDurationMinutes(row.script_payload) * MINUTE_MS,
  );

  const base = {
    lectureId: row.lecture_id,
    artifactId: row.artifact_id,
    artifactVersion: row.artifact_updated_at
      ? new Date(row.artifact_updated_at).toISOString()
      : null,
    week: row.week,
    title: row.title,
    startsAt,
    endsAt,
  };

  if (row.replay_access_granted) {
    return {
      ...base,
      available: true,
      mode: "archive",
      blockedReason: null,
    };
  }
  if (row.completed_at) {
    return {
      ...base,
      available: true,
      mode: "archive",
      blockedReason: null,
    };
  }
  if (row.joined_at) {
    return {
      ...base,
      available: true,
      mode: "live",
      blockedReason: null,
    };
  }
  if (virtualNow < startsAt) {
    return {
      ...base,
      available: false,
      mode: null,
      blockedReason: "not_started",
    };
  }
  if (virtualNow >= endsAt) {
    return {
      ...base,
      available: true,
      mode: "archive",
      blockedReason: null,
    };
  }
  return {
    ...base,
    available: false,
    mode: null,
    blockedReason: "not_joined",
  };
}

async function accessForRow(row: LectureMaterialRow | null): Promise<LectureMaterialAccess | null> {
  return row ? lectureMaterialAccessAt(row, await now()) : null;
}

export async function getLectureMaterialAccess(
  registrationNumber: string,
  publicLectureId: string,
): Promise<LectureMaterialAccess | null> {
  const row = await queryOne<LectureMaterialRow>(
    `SELECT l.public_id::text AS lecture_id,
            la.artifact_id::text AS artifact_id,
            la.updated_at AS artifact_updated_at,
            l.week, l.title, l.starts_at, a.joined_at, a.completed_at, la.script_payload,
            EXISTS (
              SELECT 1
                FROM absence_case_items AS absence_item
                JOIN absence_cases AS absence_case
                  ON absence_case.id = absence_item.case_id
                 AND absence_case.student_id = absence_item.student_id
               WHERE absence_item.student_id = l.student_id
                 AND absence_item.item_type = 'lecture'
                 AND absence_item.lecture_public_id = l.public_id
                 AND absence_item.remedy = 'replay'
                 AND absence_case.status = 'approved'
            ) AS replay_access_granted
       FROM lectures l
       LEFT JOIN lecture_artifacts la ON la.artifact_id = l.lecture_artifact_id
       LEFT JOIN attendance a ON a.lecture_id = l.id AND a.student_id = l.student_id
      WHERE l.public_id = $1::uuid AND l.student_id = $2
      LIMIT 1`,
    [publicLectureId, registrationNumber],
  );
  return accessForRow(row);
}

export async function getPresentationMaterialAccess(
  registrationNumber: string,
  artifactId: string,
): Promise<LectureMaterialAccess | null> {
  const row = await queryOne<LectureMaterialRow>(
    `SELECT l.public_id::text AS lecture_id,
            la.artifact_id::text AS artifact_id,
            la.updated_at AS artifact_updated_at,
            l.week, l.title, l.starts_at, a.joined_at, a.completed_at, la.script_payload,
            EXISTS (
              SELECT 1
                FROM absence_case_items AS absence_item
                JOIN absence_cases AS absence_case
                  ON absence_case.id = absence_item.case_id
                 AND absence_case.student_id = absence_item.student_id
               WHERE absence_item.student_id = l.student_id
                 AND absence_item.item_type = 'lecture'
                 AND absence_item.lecture_public_id = l.public_id
                 AND absence_item.remedy = 'replay'
                 AND absence_case.status = 'approved'
            ) AS replay_access_granted
       FROM lecture_artifacts la
       JOIN lectures l ON l.lecture_artifact_id = la.artifact_id
       LEFT JOIN attendance a ON a.lecture_id = l.id AND a.student_id = l.student_id
      WHERE la.artifact_id = $1::uuid AND l.student_id = $2
      LIMIT 1`,
    [artifactId, registrationNumber],
  );
  return accessForRow(row);
}
