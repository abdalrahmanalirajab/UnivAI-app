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
  makeup_access_approved?: boolean;
  makeup_started_at?: Date | null;
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
  blockedReason:
    | "not_started"
    | "not_joined"
    | "makeup_confirmation_required"
    | "makeup_closed"
    | "makeup_completed"
    | null;
};

/**
 * Decide whether presentation bytes may be served without changing attendance.
 *
 * During either the scheduled lecture or an approved make-up, only a learner
 * whose real LiveKit presence has stamped a join may read the slides. A make-up
 * uses its confirmation timestamp as the effective start and never becomes a
 * replay archive. Nothing in this path creates or updates attendance.
 */
export function lectureMaterialAccessAt(
  row: LectureMaterialRow,
  virtualNow: Date,
): LectureMaterialAccess {
  const scheduledStartsAt = new Date(row.starts_at);
  const makeupStartsAt = row.makeup_started_at
    ? new Date(row.makeup_started_at)
    : null;
  const startsAt = makeupStartsAt ?? scheduledStartsAt;
  const durationMinutes = scriptDurationMinutes(row.script_payload);
  const endsAt = new Date(
    startsAt.getTime() + durationMinutes * MINUTE_MS,
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

  if (row.makeup_access_approved) {
    if (row.completed_at) {
      return {
        ...base,
        available: false,
        mode: null,
        blockedReason: "makeup_completed",
      };
    }
    if (!makeupStartsAt) {
      return {
        ...base,
        available: false,
        mode: null,
        blockedReason: "makeup_confirmation_required",
      };
    }
    const firstJoinCutoffAt = new Date(
      makeupStartsAt.getTime() + (durationMinutes / 2) * MINUTE_MS,
    );
    if (!row.joined_at && virtualNow > firstJoinCutoffAt) {
      return {
        ...base,
        available: false,
        mode: null,
        blockedReason: "makeup_closed",
      };
    }
    if (!row.joined_at) {
      return {
        ...base,
        available: false,
        mode: null,
        blockedReason: "not_joined",
      };
    }
    return {
      ...base,
      available: true,
      mode: "live",
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
  if (virtualNow < scheduledStartsAt) {
    return {
      ...base,
      available: false,
      mode: null,
      blockedReason: "not_started",
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
            COALESCE(makeup.approved, FALSE) AS makeup_access_approved,
            makeup.makeup_started_at
       FROM lectures l
       LEFT JOIN lecture_artifacts la ON la.artifact_id = l.lecture_artifact_id
       LEFT JOIN attendance a ON a.lecture_id = l.id AND a.student_id = l.student_id
       LEFT JOIN LATERAL (
         SELECT TRUE AS approved, item.makeup_started_at
           FROM absence_case_items AS item
           JOIN absence_cases AS absence_case
             ON absence_case.id = item.case_id
            AND absence_case.student_id = item.student_id
          WHERE item.student_id = l.student_id
            AND item.item_type = 'lecture'
            AND item.lecture_public_id = l.public_id
            AND item.remedy = 'makeup_live'
            AND absence_case.status = 'approved'
          ORDER BY absence_case.decided_at DESC NULLS LAST, item.created_at DESC
          LIMIT 1
       ) AS makeup ON TRUE
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
            COALESCE(makeup.approved, FALSE) AS makeup_access_approved,
            makeup.makeup_started_at
       FROM lecture_artifacts la
       JOIN lectures l ON l.lecture_artifact_id = la.artifact_id
       LEFT JOIN attendance a ON a.lecture_id = l.id AND a.student_id = l.student_id
       LEFT JOIN LATERAL (
         SELECT TRUE AS approved, item.makeup_started_at
           FROM absence_case_items AS item
           JOIN absence_cases AS absence_case
             ON absence_case.id = item.case_id
            AND absence_case.student_id = item.student_id
          WHERE item.student_id = l.student_id
            AND item.item_type = 'lecture'
            AND item.lecture_public_id = l.public_id
            AND item.remedy = 'makeup_live'
            AND absence_case.status = 'approved'
          ORDER BY absence_case.decided_at DESC NULLS LAST, item.created_at DESC
          LIMIT 1
       ) AS makeup ON TRUE
      WHERE la.artifact_id = $1::uuid AND l.student_id = $2
      LIMIT 1`,
    [artifactId, registrationNumber],
  );
  return accessForRow(row);
}
