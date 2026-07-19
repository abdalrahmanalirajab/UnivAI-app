import { query, queryOne } from "./db";

/**
 * ClockService — the ONLY place in the entire codebase allowed to read the
 * system clock (Ground Rule 4 of the MVP-1 prompt).
 *
 * Virtual time = wall clock + offset_ms, where offset_ms lives in Postgres so
 * that the Next.js app and the Python services share one clock.
 *
 * Everything else — attendance stamping, lecture availability, quiz unlocking —
 * MUST call now() from here. Never `new Date()` / `Date.now()` in business logic.
 */

// The one sanctioned wall-clock read in the TypeScript codebase.
function wallClockMs(): number {
  return Date.now();
}

export async function getOffsetMs(): Promise<number> {
  const row = await queryOne<{ offset_ms: string }>(
    "SELECT offset_ms FROM clock_state WHERE id = 1"
  );
  return row ? Number(row.offset_ms) : 0;
}

/** Current virtual time. */
export async function now(): Promise<Date> {
  return new Date(wallClockMs() + (await getOffsetMs()));
}

export async function setOffsetMs(offsetMs: number): Promise<Date> {
  await query(
    "INSERT INTO clock_state (id, offset_ms) VALUES (1, $1) " +
      "ON CONFLICT (id) DO UPDATE SET offset_ms = EXCLUDED.offset_ms",
    [Math.round(offsetMs)]
  );
  return now();
}

/** Jump the virtual clock forward (or backward) by a delta. */
export async function advanceMs(deltaMs: number): Promise<Date> {
  const current = await getOffsetMs();
  return setOffsetMs(current + deltaMs);
}

/** Move the virtual clock so that now() === target. */
export async function setNow(target: Date): Promise<Date> {
  return setOffsetMs(target.getTime() - wallClockMs());
}

/** Reset the virtual clock back to real time. */
export async function resetClock(): Promise<Date> {
  return setOffsetMs(0);
}

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;
