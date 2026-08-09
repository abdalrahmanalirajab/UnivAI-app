import { now, MINUTE_MS } from "./clock";
import { queryOne } from "./db";
import { scriptDurationMinutes, type DurationBearingScript } from "./lecture-duration";

type LectureMaterialRow = {
  lecture_id: string;
  artifact_id: string | null;
  week: number;
  title: string;
  starts_at: Date;
  joined_at: Date | null;
  script_payload: DurationBearingScript;
};

export type LectureMaterialAccess = {
  lectureId: string;
  artifactId: string | null;
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
 * lecture. Nothing in this path creates or updates an attendance row.
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
    week: row.week,
    title: row.title,
    startsAt,
    endsAt,
  };

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
            l.week, l.title, l.starts_at, a.joined_at, la.script_payload
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
            l.week, l.title, l.starts_at, a.joined_at, la.script_payload
       FROM lecture_artifacts la
       JOIN lectures l ON l.lecture_artifact_id = la.artifact_id
       LEFT JOIN attendance a ON a.lecture_id = l.id AND a.student_id = l.student_id
      WHERE la.artifact_id = $1::uuid AND l.student_id = $2
      LIMIT 1`,
    [artifactId, registrationNumber],
  );
  return accessForRow(row);
}
