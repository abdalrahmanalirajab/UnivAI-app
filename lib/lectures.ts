import { query } from "./db";
import { now, MINUTE_MS } from "./clock";
import type { ProgrammePlanV1 } from "@/test/fixtures/programme-plan-v1";
import { getSetting, setSetting } from "./settings";
import {
  GeneratedSemesterPlanError,
  readGeneratedSemesterWeekCount,
} from "./semester-plan";
import { LEGACY_LECTURE_MINUTES, scriptDurationMinutes } from "./lecture-duration";

/** Database-owned generated lecture and section read models. */

/** How long a lecture is "on" for. */
export const LECTURE_WINDOW_MINUTES = LEGACY_LECTURE_MINUTES;
/**
 * You cannot walk into a lecture that is already half over — you would miss the
 * material the quiz is about. Turning up after this is an absence, not a late arrival.
 */
export const JOIN_CUTOFF_MINUTES = LECTURE_WINDOW_MINUTES / 2;

export type Segment = { slide: number; text: string; citations: { page: number }[] };
export type Script = {
  lectureId: string;
  title: string;
  /** Written by the Agent; absent on legacy and fixture scripts. */
  durationMinutes?: number;
  segments: Segment[];
};

/** Why a lecture cannot be opened. `null` means it can. */
export type BlockedReason = "not_started" | "too_late" | "completed" | "missed" | null;

/**
 * Every record the schedule serves is explicitly one of these — a lecture and
 * a section are never merged into one ambiguous kind.
 */
export type SessionType = "lecture" | "section";

export type SectionKind = "tutorial" | "lab";

export type SectionPackV1 = {
  week: number;
  sections: Array<{
    id: string;
    week: number;
    kind: SectionKind;
    title: string;
    duration_minutes?: number;
  }>;
};

export type Lecture = {
  /** Opaque, database-generated public identifier. */
  id: string;
  /** Internal FK; never serialized to a client. */
  internalId: number;
  session_type: "lecture";
  week: number;
  title: string;
  startsAt: Date;
  /** The doors close here: halfway through. */
  joinCutoffAt: Date;
  endsAt: Date;
  /** derived from the VIRTUAL clock, never the wall clock */
  state: "upcoming" | "live" | "done";
  joinable: boolean;
  blockedReason: BlockedReason;
  completed: boolean;
};

/**
 * A generated practical section that follows its theoretical lecture. No
 * SectionPack means no schedule entry; placeholders are never synthesized.
 */
export type Section = {
  id: string;
  session_type: "section";
  week: number;
  kind: SectionKind;
  title: string;
  /** Immediately after its lecture ends. */
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
};

export const DEFAULT_SECTION_MINUTES = 45;
export const MIN_SECTION_MINUTES = 30;
export const MAX_SECTION_MINUTES = 120;

export async function readScript(sid: string, week: number): Promise<Script | null> {
  const rows = await query<{ script_payload: Script }>(
    `SELECT la.script_payload
       FROM lectures l
       JOIN lecture_artifacts la ON la.artifact_id = l.lecture_artifact_id
      WHERE l.student_id = $1 AND l.week = $2`,
    [sid, week],
  );
  return rows[0]?.script_payload ?? null;
}

export type SlideDeck = {
  /** Opaque database artifact UUID used only to address its Slidev cache. */
  presentationId: string;
  week: number;
  title: string;
  slides: Array<{ slide: number; heading: string; bullets: string[]; page: number }>;
};

export async function readSlides(sid: string, publicLectureId: string): Promise<SlideDeck | null> {
  const rows = await query<{ presentation_id: string; slides_payload: Omit<SlideDeck, "presentationId"> }>(
    `SELECT la.artifact_id::text AS presentation_id, la.slides_payload
       FROM lectures l
       JOIN lecture_artifacts la ON la.artifact_id = l.lecture_artifact_id
      WHERE l.student_id = $1 AND l.public_id = $2::uuid`,
    [sid, publicLectureId],
  );
  const row = rows[0];
  return row ? { ...row.slides_payload, presentationId: row.presentation_id } : null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type ApprovedSchedulePlan = {
  programmeId: number;
  planVersion: number;
  weekCount: number;
  sectionPacks: SectionPackV1[];
  generated: boolean;
};

type ScheduleBinding = {
  programmeId: number;
  planVersion: number;
  weekCount: number;
};

export class ScheduleIntegrityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ScheduleIntegrityError";
  }
}

function scheduleBindingKey(sid: string): string {
  return `schedule:${sid}:approved-plan`;
}

async function approvedSchedulePlan(sid: string): Promise<ApprovedSchedulePlan | null> {
  let rows: Array<{ id: number; plan_version: number; plan: unknown }>;
  try {
    rows = await query<{ id: number; plan_version: number; plan: unknown }>(
      `SELECT id, plan_version, plan FROM programmes
        WHERE student_id = $1 AND status = 'approved'
        ORDER BY id DESC LIMIT 1`,
      [sid],
    );
  } catch (error) {
    if ((error as { code?: string })?.code === "42P01") return null;
    throw error;
  }
  if (rows.length === 0) return null;

  const row = rows[0];
  const plan = row.plan as Partial<ProgrammePlanV1>;
  let generatedWeeks: number | null;
  try {
    generatedWeeks = await readGeneratedSemesterWeekCount(sid);
  } catch (error) {
    if (error instanceof GeneratedSemesterPlanError) {
      throw new ScheduleIntegrityError("INVALID_GENERATED_PLAN", error.message);
    }
    throw error;
  }
  const weeks = generatedWeeks ?? plan?.workload?.weeks_per_semester;
  if (typeof weeks !== "number" || !Number.isInteger(weeks) || weeks < 1) {
    throw new ScheduleIntegrityError(
      "INVALID_APPROVED_PLAN",
      "The approved programme has no valid weeks_per_semester.",
    );
  }

  const storedPacks = await query<{
    section_pack_id: string;
    week: number;
    pack_payload: { title?: unknown; total_minutes?: unknown };
  }>(
    `SELECT section_pack_id, week, pack_payload
       FROM section_packs
      WHERE tenant_id = $1 AND programme_id = $2
        AND approved_plan_version = $3
      ORDER BY week ASC`,
    [sid, String(row.id), row.plan_version],
  );
  const sectionPacks = storedPacks.flatMap((stored): SectionPackV1[] => {
    const title = stored.pack_payload?.title;
    const minutes = stored.pack_payload?.total_minutes;
    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof minutes !== "number" ||
      !Number.isInteger(minutes) ||
      minutes < MIN_SECTION_MINUTES ||
      minutes > MAX_SECTION_MINUTES
    ) {
      throw new ScheduleIntegrityError(
        "INVALID_SECTION_PACKS",
        `The stored section for week ${stored.week} is invalid.`,
      );
    }
    return [{
      week: stored.week,
      sections: [{
        id: stored.section_pack_id,
        week: stored.week,
        kind: "tutorial",
        title,
        duration_minutes: minutes,
      }],
    }];
  });

  return {
    programmeId: row.id,
    planVersion: row.plan_version,
    weekCount: weeks,
    sectionPacks,
    generated: generatedWeeks !== null,
  };
}

async function scheduleBinding(sid: string): Promise<ScheduleBinding | null> {
  const raw = await getSetting(scheduleBindingKey(sid));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ScheduleBinding>;
    if (
      !Number.isInteger(parsed.programmeId) ||
      !Number.isInteger(parsed.planVersion) ||
      !Number.isInteger(parsed.weekCount)
    ) {
      throw new Error("invalid binding");
    }
    return parsed as ScheduleBinding;
  } catch {
    throw new ScheduleIntegrityError(
      "INVALID_SCHEDULE_BINDING",
      "The saved schedule is invalid. Ask an administrator to rebuild it.",
    );
  }
}

/** The canonical fresh-semester anchor: tomorrow at 10:00, virtual time. */
function firstLectureStart(virtualNow: Date): Date {
  const start = new Date(virtualNow);
  start.setUTCDate(start.getUTCDate() + 1);
  start.setUTCHours(10, 0, 0, 0);
  return start;
}

/**
 * How many weekly lectures the semester has, from the student's APPROVED
 * programme plan (workload.weeks_per_semester, ProgrammePlanV1) — never from
 * a fixed constant. A programme that is not yet approved is a legitimate
 * state (the schedule is simply empty until it is); a deployment without the
 * programmes table (standalone) has no plan at all (0). But an APPROVED
 * programme whose plan data is missing or unusable is corruption — an
 * explicit rejection, never a silent pass-through.
 */
async function approvedWeekCount(sid: string): Promise<number> {
  return (await approvedSchedulePlan(sid))?.weekCount ?? 0;
}

/**
 * The plan_version of the student's CURRENT approved programme — the real
 * version the schedule was built from. `null` when there is no approved
 * programme yet (pre-approval or standalone); clients use it to detect that
 * their view is behind the server's and explain it instead of silently
 * re-fetching.
 */
export async function approvedPlanVersion(sid: string): Promise<number | null> {
  return (await approvedSchedulePlan(sid))?.planVersion ?? null;
}

/**
 * Link newly seeded schedule rows to this learner's latest database artifacts.
 * The generator can finish before the first schedule read creates lecture
 * rows, so this idempotent update closes that ordering gap by week.
 */
async function linkGeneratedArtifacts(sid: string): Promise<void> {
  await query(
    `WITH latest AS (
       SELECT DISTINCT ON (la.week)
              la.week, la.artifact_id, la.book_id, la.title
         FROM lecture_artifacts la
        WHERE la.student_id = $1
        ORDER BY la.week, la.book_id DESC
     )
     UPDATE lectures l SET
       lecture_artifact_id = latest.artifact_id,
       book_id = latest.book_id,
       title = latest.title
      FROM latest
     WHERE l.student_id = $1 AND l.week = latest.week`,
    [sid],
  );
}

export async function ensureSchedule(sid: string): Promise<ApprovedSchedulePlan | null> {
  const approved = await approvedSchedulePlan(sid);
  const rows = await query<{ week: number }>(
    "SELECT week FROM lectures WHERE student_id = $1 ORDER BY week ASC",
    [sid],
  );
  if (!approved) {
    if (rows.length > 0) {
      throw new ScheduleIntegrityError(
        "MISSING_APPROVED_PLAN",
        "A saved schedule exists without an approved programme.",
      );
    }
    return null;
  }

  const binding = await scheduleBinding(sid);
  if (binding) {
    if (binding.programmeId !== approved.programmeId || binding.planVersion !== approved.planVersion) {
      throw new ScheduleIntegrityError(
        "STALE_SCHEDULE",
        "The saved schedule belongs to an older approved plan. Rebuild it before continuing.",
      );
    }
    if (binding.weekCount !== approved.weekCount) {
      if (!approved.generated || (await semesterHasStarted(sid))) {
        throw new ScheduleIntegrityError(
          "STALE_SCHEDULE",
          "The saved schedule has a different semester length. Rebuild it before continuing.",
        );
      }
      // Generation has replaced the pre-generation maximum with the book's
      // actual plan. Before week 1 starts it is safe to resize in place: retain
      // existing rows/artifact links, remove only the unused tail, and add any
      // missing rows for a legacy shorter placeholder.
      const starts = await query<{ starts_at: Date | null }>(
        "SELECT MIN(starts_at) AS starts_at FROM lectures WHERE student_id = $1",
        [sid],
      );
      const start = starts[0]?.starts_at
        ? new Date(starts[0].starts_at)
        : firstLectureStart(await now());
      await query("DELETE FROM lectures WHERE student_id = $1 AND week > $2", [
        sid,
        approved.weekCount,
      ]);
      const existingWeeks = new Set(rows.map((row) => row.week));
      for (let week = 1; week <= approved.weekCount; week++) {
        const startsAt = new Date(start.getTime() + (week - 1) * WEEK_MS);
        if (existingWeeks.has(week)) {
          await query("UPDATE lectures SET starts_at = $1 WHERE student_id = $2 AND week = $3", [
            startsAt,
            sid,
            week,
          ]);
        } else {
          const script = await readScript(sid, week);
          await query(
            `INSERT INTO lectures (student_id, week, title, starts_at, status) VALUES ($1, $2, $3, $4, 'ready')
             ON CONFLICT (student_id, week) DO NOTHING`,
            [sid, week, script?.title ?? `Week ${week}`, startsAt],
          );
        }
      }
      await setSetting(
        scheduleBindingKey(sid),
        JSON.stringify({
          programmeId: approved.programmeId,
          planVersion: approved.planVersion,
          weekCount: approved.weekCount,
        } satisfies ScheduleBinding),
      );
    }
    await linkGeneratedArtifacts(sid);
    return approved;
  }

  if (rows.length > 0) {
    throw new ScheduleIntegrityError(
      "UNBOUND_SCHEDULE",
      "The saved schedule is not linked to the approved plan. Rebuild it before continuing.",
    );
  }

  const start = firstLectureStart(await now());

  for (let week = 1; week <= approved.weekCount; week++) {
    const script = await readScript(sid, week);
    const startsAt = new Date(start.getTime() + (week - 1) * WEEK_MS);
    await query(
      `INSERT INTO lectures (student_id, week, title, starts_at, status) VALUES ($1, $2, $3, $4, 'ready')
       ON CONFLICT (student_id, week) DO NOTHING`,
      [sid, week, script?.title ?? `Week ${week}`, startsAt]
    );
  }
  await setSetting(
    scheduleBindingKey(sid),
    JSON.stringify({
      programmeId: approved.programmeId,
      planVersion: approved.planVersion,
      weekCount: approved.weekCount,
    } satisfies ScheduleBinding),
  );
  await linkGeneratedArtifacts(sid);
  return approved;
}

/**
 * Move one student's schedule to a fresh start (same cadence as ensureSchedule:
 * tomorrow 10:00 virtual time, then weekly). Used by the semester restart — the
 * lecture rows and their generated content stay.
 */
export async function rescheduleLectures(sid: string): Promise<void> {
  if (await semesterHasStarted(sid)) {
    throw new ScheduleIntegrityError(
      "PLAN_ALREADY_STARTED",
      "This approved plan has already started, so its schedule and history cannot be rewritten.",
    );
  }
  const approved = await ensureSchedule(sid);
  if (!approved) return;
  const start = firstLectureStart(await now());
  for (let week = 1; week <= approved.weekCount; week++) {
    const startsAt = new Date(start.getTime() + (week - 1) * WEEK_MS);
    await query("UPDATE lectures SET starts_at = $1 WHERE week = $2 AND student_id = $3", [
      startsAt,
      week,
      sid,
    ]);
  }
}

/**
 * Whether the student's current plan version has already started, by the
 * semester's own anchor: a plan version is started once virtual time has
 * reached its first scheduled lecture's start (the fresh-semester anchor
 * from firstLectureStart — week 1 begins the plan, and only from then can
 * attendance be stamped). An empty schedule (no approved plan yet) has not
 * started. Anything that would rewrite attendance/history for a started
 * plan must be refused at the call site, never silently no-oped.
 */
export async function semesterHasStarted(sid: string): Promise<boolean> {
  const virtualNow = await now();
  const rows = await query<{ starts_at: Date }>(
    "SELECT MIN(starts_at) AS starts_at FROM lectures WHERE student_id = $1",
    [sid]
  );
  const first = rows[0]?.starts_at;
  return Boolean(first && virtualNow.getTime() >= new Date(first).getTime());
}

export type ScheduleRejection =
  | { code: "DUPLICATE_LECTURE_WEEK"; message: string }
  | { code: "NON_CONTIGUOUS_LECTURE_WEEKS"; message: string }
  | { code: "LECTURE_COUNT_MISMATCH"; message: string };

/**
 * Integrity check over one student's lecture records before they are served.
 * Ownership is enforced by construction: the query is scoped to the caller's
 * student id, so records belonging to any other user can never appear here
 * (the same invariant lib/programmes.ts keeps for programmes). Duplicate
 * (student_id, week) rows and week sequences with gaps or a missing week 1
 * are corruption — rejected explicitly, never passed through silently.
 * Section records come from the same approved, versioned plan and are
 * validated before they are placed after their lecture.
 */
export async function validateSchedule(
  sid: string,
  expectedWeekCount?: number,
): Promise<ScheduleRejection | null> {
  const requiredWeeks = expectedWeekCount ?? (await approvedWeekCount(sid));
  const rows = await query<{ week: number }>(
    "SELECT week FROM lectures WHERE student_id = $1 ORDER BY week ASC",
    [sid]
  );

  const seen = new Set<number>();
  for (const row of rows) {
    if (seen.has(row.week)) {
      return {
        code: "DUPLICATE_LECTURE_WEEK",
        message: `Duplicate lecture records for week ${row.week}.`,
      };
    }
    seen.add(row.week);
  }

  for (let index = 0; index < rows.length; index++) {
    if (rows[index].week !== index + 1) {
      return {
        code: "NON_CONTIGUOUS_LECTURE_WEEKS",
        message: `Lecture weeks must be contiguous starting at 1; expected ${index + 1}, found ${rows[index].week}.`,
      };
    }
  }

  if (rows.length !== requiredWeeks) {
    return {
      code: "LECTURE_COUNT_MISMATCH",
      message: `The approved plan requires ${requiredWeeks} lectures, but ${rows.length} are saved.`,
    };
  }

  return null;
}

export async function getLectures(sid: string): Promise<Lecture[]> {
  const approved = await ensureSchedule(sid);
  if (!approved) return [];
  const rejection = await validateSchedule(sid, approved.weekCount);
  if (rejection) throw new ScheduleIntegrityError(rejection.code, rejection.message);
  const virtualNow = await now();

  const rows = await query<{
    id: number;
    public_id: string;
    week: number;
    title: string;
    starts_at: Date;
    joined_at: Date | null;
    completed_at: Date | null;
  }>(
    `SELECT l.id, l.public_id::text AS public_id, l.week, l.title, l.starts_at,
            a.joined_at, a.completed_at
       FROM lectures l
       LEFT JOIN attendance a ON a.lecture_id = l.id AND a.student_id = $1
      WHERE l.student_id = $1
      ORDER BY l.week ASC`,
    [sid]
  );

  return Promise.all(rows.map(async (row) => {
    const startsAt = new Date(row.starts_at);
    const durationMinutes = scriptDurationMinutes(await readScript(sid, row.week));
    const cutoffMinutes = durationMinutes / 2;
    const cutoff = new Date(startsAt.getTime() + cutoffMinutes * MINUTE_MS);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * MINUTE_MS);
    const completed = Boolean(row.completed_at);

    let state: Lecture["state"] = "upcoming";
    if (virtualNow >= endsAt) state = "done";
    else if (virtualNow >= startsAt) state = "live";
    // Time travel makes contradictions possible: sit through a lecture, then
    // reset the clock to before it "starts", and it would show LIVE or
    // upcoming while refusing to open ("already finished"). A lecture you
    // completed is done, whatever the clock claims.
    if (completed) state = "done";

    let blockedReason: BlockedReason = null;
    if (completed) {
      blockedReason = "completed";              // you have already sat through it
    } else if (virtualNow < startsAt) {
      blockedReason = "not_started";
    } else if (virtualNow > cutoff) {
      // More than half the lecture has gone. Too late to walk in.
      blockedReason = row.joined_at ? "too_late" : "missed";
    }

    return {
      id: row.public_id,
      internalId: row.id,
      session_type: "lecture",
      week: row.week,
      title: row.title,
      startsAt,
      joinCutoffAt: cutoff,
      endsAt,
      state,
      completed,
      joinable: blockedReason === null,
      blockedReason,
    };
  }));
}

export const BLOCKED_MESSAGE: Record<NonNullable<BlockedReason>, string> = {
  not_started: "This lecture has not started yet.",
  too_late: "You cannot rejoin after the lecture's halfway point.",
  missed: "You missed this lecture. The doors close halfway through.",
  completed: "You have already finished this lecture.",
};

/**
 * Generated practical sections only. A grounding refusal produces no fake
 * timetable entry.
 */
export async function getSections(sid: string): Promise<Section[]> {
  const lectures = await getLectures(sid);
  const approved = await approvedSchedulePlan(sid);
  if (!approved) return [];
  const sections: Section[] = [];
  for (const lecture of lectures) {
    const pack = approved.sectionPacks.find((candidate) => candidate.week === lecture.week);
    const startsAt = new Date(lecture.endsAt.getTime());
    const plannedSections = pack?.sections ?? [];
    for (const record of plannedSections) {
      const durationMinutes = record.duration_minutes ?? DEFAULT_SECTION_MINUTES;
      sections.push({
        id: record.id,
        session_type: "section",
        week: record.week,
        kind: record.kind,
        title: record.title,
        startsAt,
        endsAt: new Date(startsAt.getTime() + durationMinutes * MINUTE_MS),
        durationMinutes,
      });
    }
  }
  return sections;
}

export type StoredSectionPack = {
  id: string;
  week: number;
  lectureInternalId: number;
  lecturePublicId: string;
  /**
   * The lecture's scheduled end has passed, so its section is open.
   *
   * This deliberately does not ask whether the learner sat through to the end.
   * Completion is only ever recorded when the Lecturer reaches the last line of
   * the script with the learner present, so gating on it meant that leaving a
   * lecture early forfeited that week's section permanently, with no way back.
   * A section now opens on the clock, exactly like the week's quiz.
   */
  lectureEnded: boolean;
  lectureEndsAt: Date;
  programmeId: string;
  programmeTitle: string;
  planVersion: number;
  payload: {
    schema_name: "univai.section.pack";
    schema_version: "1.0.0";
    session_type: "section";
    title: string;
    lecture_title: string;
    course_id: string;
    topic_id: string;
    total_minutes: number;
    objectives: string[];
    activities: Array<Record<string, unknown>>;
    examples: Array<Record<string, unknown>>;
    todos: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
};

export async function getSectionPack(sid: string, sectionId: string): Promise<StoredSectionPack | null> {
  const rows = await query<{
    section_pack_id: string;
    week: number;
    programme_id: string;
    approved_plan_version: number;
    pack_payload: StoredSectionPack["payload"];
    lecture_internal_id: number;
    lecture_public_id: string;
    lecture_starts_at: Date;
    lecture_script: { durationMinutes?: number } | null;
    programme_title: string;
  }>(
    `SELECT sp.section_pack_id, sp.week, sp.programme_id,
            sp.approved_plan_version, sp.pack_payload,
            l.id AS lecture_internal_id, l.public_id::text AS lecture_public_id,
            l.starts_at AS lecture_starts_at,
            la.script_payload AS lecture_script,
            p.name AS programme_title
       FROM section_packs sp
       JOIN programmes p ON p.id::text = sp.programme_id
        AND p.student_id = sp.tenant_id
        AND p.status = 'approved'
        AND p.plan_version = sp.approved_plan_version
       JOIN lectures l ON l.student_id = sp.tenant_id AND l.week = sp.week
       LEFT JOIN lecture_artifacts la ON la.artifact_id = l.lecture_artifact_id
      WHERE sp.tenant_id = $1 AND sp.section_pack_id = $2
      LIMIT 1`,
    [sid, sectionId],
  );
  const row = rows[0];
  if (!row) return null;
  const lectureEndsAt = new Date(
    new Date(row.lecture_starts_at).getTime() +
      scriptDurationMinutes(row.lecture_script) * MINUTE_MS,
  );
  return {
    id: row.section_pack_id,
    week: row.week,
    lectureInternalId: row.lecture_internal_id,
    lecturePublicId: row.lecture_public_id,
    lectureEnded: (await now()) >= lectureEndsAt,
    lectureEndsAt,
    programmeId: row.programme_id,
    programmeTitle: row.programme_title,
    planVersion: row.approved_plan_version,
    payload: row.pack_payload,
  };
}
