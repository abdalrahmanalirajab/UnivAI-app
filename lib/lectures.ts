import { promises as fs } from "fs";
import path from "path";
import { query } from "./db";
import { now, MINUTE_MS } from "./clock";

/**
 * Lecture content is PREMADE and committed under lectures/week-N/:
 *   slides.md    a Slidev deck (markdown only)
 *   script.json  the narration the Lecturer agent speaks, with page citations
 * Nothing here generates content.
 */

export const REPO_ROOT = path.resolve(process.cwd(), "..");
export const LECTURES_DIR = path.join(REPO_ROOT, "lectures");
export const WEEKS = 4;

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

export type Lecture = {
  id: number;
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

export async function readScript(week: number): Promise<Script | null> {
  try {
    const raw = await fs.readFile(path.join(LECTURES_DIR, `week-${week}`, "script.json"), "utf-8");
    return JSON.parse(raw) as Script;
  } catch {
    return null;
  }
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The canonical fresh-semester anchor: tomorrow at 10:00, virtual time. */
function firstLectureStart(virtualNow: Date): Date {
  const start = new Date(virtualNow);
  start.setUTCDate(start.getUTCDate() + 1);
  start.setUTCHours(10, 0, 0, 0);
  return start;
}

/** Seed the 4-week schedule: one lecture a week, starting tomorrow 10:00 virtual time. */
export async function ensureSchedule(): Promise<void> {
  const existing = await query<{ count: string }>("SELECT COUNT(*)::text AS count FROM lectures");
  if (Number(existing[0]?.count ?? 0) >= WEEKS) return;

  const start = firstLectureStart(await now());

  for (let week = 1; week <= WEEKS; week++) {
    const script = await readScript(week);
    const startsAt = new Date(start.getTime() + (week - 1) * WEEK_MS);
    await query(
      `INSERT INTO lectures (week, title, starts_at, status) VALUES ($1, $2, $3, 'ready')
       ON CONFLICT (week) DO NOTHING`,
      [week, script?.title ?? `Week ${week}`, startsAt]
    );
  }
}

/**
 * Move the whole schedule to a fresh start (same cadence as ensureSchedule:
 * tomorrow 10:00 virtual time, then weekly). Used by the admin's semester
 * restart — the lecture rows and their generated content stay.
 */
export async function rescheduleLectures(): Promise<void> {
  const start = firstLectureStart(await now());
  for (let week = 1; week <= WEEKS; week++) {
    const startsAt = new Date(start.getTime() + (week - 1) * WEEK_MS);
    await query("UPDATE lectures SET starts_at = $1 WHERE week = $2", [startsAt, week]);
  }
}

export async function getLectures(): Promise<Lecture[]> {
  await ensureSchedule();
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
       LEFT JOIN attendance a ON a.lecture_id = l.id
      ORDER BY l.week ASC`
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
