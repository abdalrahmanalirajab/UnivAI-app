export const LEGACY_LECTURE_MINUTES = 60;

export type DurationBearingScript = { durationMinutes?: number } | null;

/** Accept the Agent's 30-120 minute contract; preserve 60 for legacy scripts. */
export function scriptDurationMinutes(script: DurationBearingScript): number {
  const value = script?.durationMinutes;
  return typeof value === "number" && Number.isInteger(value) && value >= 30 && value <= 120
    ? value
    : LEGACY_LECTURE_MINUTES;
}
