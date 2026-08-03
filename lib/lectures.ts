import { promises as fs } from "fs";
import path from "path";
import { query } from "./db";
import { now, MINUTE_MS } from "./clock";
import { DATA_ROOT, LECTURES_ROOT } from "./paths";
import type { ProgrammePlanV1 } from "@/test/fixtures/programme-plan-v1";
import { getSetting, setSetting } from "./settings";

/**
 * Lecture content is PREMADE and committed under lectures/week-N/:
 *   slides.md    a Slidev deck (markdown only)
 *   script.json  the narration the Lecturer agent speaks, with page citations
 * Nothing here generates content.
 */

export const REPO_ROOT = DATA_ROOT;
export const LECTURES_DIR = LECTURES_ROOT;

/** How long a lecture is "on" for. */
export const LECTURE_WINDOW_MINUTES = 60;
/**
 * You cannot walk into a lecture that is already half over — you would miss the
 * material the quiz is about. Turning up after this is an absence, not a late arrival.
 */
export const JOIN_CUTOFF_MINUTES = LECTURE_WINDOW_MINUTES / 2;

export type Segment = { slide: number; text: string; citations: { page: number }[] };
export type Script = { lectureId: string; title: string; segments: Segment[] };

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
  }>;
};

export type Lecture = {
  id: number;
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
 * A scheduled section (tutorial/lab) that follows its lecture. Sections are
 * produced ONLY from a real, approved SectionPack for the week — never
 * speculatively. They are not persisted: the versioned fixture is their
 * temporary source of truth until the Agent producer lands.
 */
export type Section = {
  id: string;
  session_type: "section";
  week: number;
  kind: SectionKind;
  title: string;
  /** Immediately after its lecture ends. */
  startsAt: Date;
};

/**
 * Per-student on-disk course layout: lectures/<studentId>/week-N/. Each learner
 * uploads their own book and gets their own generated slides, script and audio,
 * so the content is namespaced by studentId (matches UnivAI-Agent generation and
 * the UnivAI-live worker). studentId (S-YYYY-NNNNNN) is filesystem-safe.
 */
export function lectureDir(sid: string, week: number): string {
  return path.join(LECTURES_DIR, sid, `week-${week}`);
}

export async function readScript(sid: string, week: number): Promise<Script | null> {
  try {
    const raw = await fs.readFile(path.join(lectureDir(sid, week), "script.json"), "utf-8");
    return JSON.parse(raw) as Script;
  } catch {
    return null;
  }
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type ApprovedSchedulePlan = {
  programmeId: number;
  planVersion: number;
  weekCount: number;
  sectionPacks: SectionPackV1[];
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

function invalidSectionPacks(): never {
  throw new ScheduleIntegrityError(
    "INVALID_SECTION_PACKS",
    "The approved plan has invalid section records.",
  );
}

function parseSectionPacks(value: unknown, weekCount: number): SectionPackV1[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalidSectionPacks();

  const seenWeeks = new Set<number>();
  const seenIds = new Set<string>();
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object") invalidSectionPacks();
    const pack = candidate as Partial<SectionPackV1>;
    if (
      !Number.isInteger(pack.week) ||
      !pack.week ||
      pack.week < 1 ||
      pack.week > weekCount ||
      seenWeeks.has(pack.week) ||
      !Array.isArray(pack.sections)
    ) {
      invalidSectionPacks();
    }
    const packWeek = pack.week as number;
    seenWeeks.add(packWeek);
    const sections = pack.sections.map((candidateSection) => {
      const section = candidateSection as Partial<SectionPackV1["sections"][number]>;
      if (
        typeof section.id !== "string" ||
        section.id.length === 0 ||
        seenIds.has(section.id) ||
        section.week !== packWeek ||
        (section.kind !== "tutorial" && section.kind !== "lab") ||
        typeof section.title !== "string" ||
        section.title.trim().length === 0
      ) {
        invalidSectionPacks();
      }
      seenIds.add(section.id);
      return {
        id: section.id,
        week: packWeek,
        kind: section.kind,
        title: section.title,
      };
    });
    return { week: packWeek, sections };
  });
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
  const plan = row.plan as Partial<ProgrammePlanV1> & { section_packs?: unknown };
  const weeks = plan?.workload?.weeks_per_semester;
  if (typeof weeks !== "number" || !Number.isInteger(weeks) || weeks < 1) {
    throw new ScheduleIntegrityError(
      "INVALID_APPROVED_PLAN",
      "The approved programme has no valid weeks_per_semester.",
    );
  }

  return {
    programmeId: row.id,
    planVersion: row.plan_version,
    weekCount: weeks,
    sectionPacks: parseSectionPacks(plan.section_packs, weeks),
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

/** Seed one student's schedule from the approved plan: a lecture a week from tomorrow 10:00 virtual. */
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
    if (
      binding.programmeId !== approved.programmeId ||
      binding.planVersion !== approved.planVersion ||
      binding.weekCount !== approved.weekCount
    ) {
      throw new ScheduleIntegrityError(
        "STALE_SCHEDULE",
        "The saved schedule belongs to an older approved plan. Rebuild it before continuing.",
      );
    }
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
    week: number;
    title: string;
    starts_at: Date;
    joined_at: Date | null;
    completed_at: Date | null;
  }>(
    `SELECT l.id, l.week, l.title, l.starts_at, a.joined_at, a.completed_at
       FROM lectures l
       LEFT JOIN attendance a ON a.lecture_id = l.id AND a.student_id = $1
      WHERE l.student_id = $1
      ORDER BY l.week ASC`,
    [sid]
  );

  return rows.map((row) => {
    const startsAt = new Date(row.starts_at);
    const cutoff = new Date(startsAt.getTime() + JOIN_CUTOFF_MINUTES * MINUTE_MS);
    const endsAt = new Date(startsAt.getTime() + LECTURE_WINDOW_MINUTES * MINUTE_MS);
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
      id: row.id,
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
  });
}

export const BLOCKED_MESSAGE: Record<NonNullable<BlockedReason>, string> = {
  not_started: "This lecture has not started yet.",
  too_late: `You cannot rejoin: more than ${JOIN_CUTOFF_MINUTES} minutes of the lecture have passed.`,
  missed: `You missed this lecture. The doors close ${JOIN_CUTOFF_MINUTES} minutes after it starts.`,
  completed: "You have already finished this lecture.",
};

/**
 * The student's scheduled sections. A section exists ONLY when a real,
 * approved SectionPack exists in the exact approved plan version. Every
 * section starts immediately after its lecture ends; absent packs never create
 * placeholder sections.
 */
export async function getSections(sid: string): Promise<Section[]> {
  const lectures = await getLectures(sid);
  const approved = await approvedSchedulePlan(sid);
  if (!approved) return [];
  const sections: Section[] = [];
  for (const lecture of lectures) {
    const pack = approved.sectionPacks.find((candidate) => candidate.week === lecture.week);
    if (!pack) continue;
    const startsAt = new Date(lecture.endsAt.getTime());
    for (const record of pack.sections) {
      sections.push({
        id: record.id,
        session_type: "section",
        week: record.week,
        kind: record.kind,
        title: record.title,
        startsAt,
      });
    }
  }
  return sections;
}
