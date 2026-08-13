export const ATTENDED_MIN_PERCENT = 70;
export const PARTIALLY_ATTENDED_MIN_PERCENT = 50;

export type ParticipationStatus =
  | "attended"
  | "partially_attended"
  | "absent"
  | "upcoming";

/**
 * Percentage of unique lecture content delivered to this learner.
 *
 * Replayed context sentences are deliberately excluded because the worker's
 * durable checkpoint only advances beyond the furthest new sentence.
 */
export function lectureCoveragePercent(input: {
  nextSentenceIndex: number;
  totalSentences: number;
  completed: boolean;
}): number {
  if (input.completed) return 100;
  const total = Math.max(0, Math.trunc(input.totalSentences));
  if (!total) return 0;
  const delivered = Math.min(total, Math.max(0, Math.trunc(input.nextSentenceIndex)));
  return (delivered / total) * 100;
}

/** Exactly 70% is attended; 50% through 69.9% is partially attended. */
export function classifyParticipation(
  percentage: number,
  options: { upcoming?: boolean } = {},
): ParticipationStatus {
  if (options.upcoming) return "upcoming";
  if (percentage >= ATTENDED_MIN_PERCENT) return "attended";
  if (percentage >= PARTIALLY_ATTENDED_MIN_PERCENT) return "partially_attended";
  return "absent";
}
