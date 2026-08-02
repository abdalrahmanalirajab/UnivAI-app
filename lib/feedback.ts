import { queryOne } from "./db";

/**
 * Feedback on generated output: thumbs up/down, an issue flag, and an
 * optional note, linked to the output_version and trace_id of the
 * generation that produced it.
 *
 * Field-name note (issue 0g): no output_version/trace_id shape exists in
 * this repo yet — grep across lib/ and app/ returns zero matches — so the
 * names are taken verbatim from the issue contract rather than a parallel
 * invented pair. Real values come from the generation pipeline when it
 * grows the fields (see docs/proposed-generation-citation-contract.md).
 * Validation here enforces the format; linkage to a produced row is by
 * contract, not by a foreign key (no such relationship exists in the
 * schema).
 *
 * Storage note: like lib/collections.ts and lib/programmes.ts, queries
 * target a table (`feedback`) defined in the parent monorepo's
 * infra/schema.sql, not in this repo's standalone/schema.sql.
 *
 * Schema version: 1.0.0
 */

export type FeedbackRating = "up" | "down";

export type FeedbackInput = {
  /** Version of the generated output being rated. */
  output_version: string;
  /** Trace id of the generation run being rated. */
  trace_id: string;
  /** Thumbs up or down. */
  rating: FeedbackRating;
  /** Whether the output is flagged as wrong/broken. */
  issue: boolean;
  /** Optional explanatory note; null when the student wrote none. */
  note: string | null;
};

export type Feedback = FeedbackInput & {
  id: number;
  student_id: string;
  created_at: string;
};

export type FeedbackResult =
  | { ok: true; feedback: Feedback }
  | { ok: false; error: string };

const FEEDBACK_COLUMNS =
  "id, student_id, output_version, trace_id, rating, issue, note, created_at";

const VALID_RATINGS: readonly FeedbackRating[] = ["up", "down"];

export function validateOutputVersion(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 200) {
    return "output_version must be a non-empty string of at most 200 characters.";
  }
  return null;
}

export function validateTraceId(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 200) {
    return "trace_id must be a non-empty string of at most 200 characters.";
  }
  return null;
}

export function validateRating(value: string): string | null {
  if (!VALID_RATINGS.includes(value as FeedbackRating)) {
    return `rating must be one of: ${VALID_RATINGS.join(", ")}.`;
  }
  return null;
}

export function validateNote(value: string | null): string | null {
  if (value !== null && value.trim().length > 2000) {
    return "note must be at most 2000 characters.";
  }
  return null;
}

export function validateFeedback(input: FeedbackInput): string | null {
  const outputVersionMsg = validateOutputVersion(input.output_version);
  if (outputVersionMsg) return outputVersionMsg;
  const traceIdMsg = validateTraceId(input.trace_id);
  if (traceIdMsg) return traceIdMsg;
  const ratingMsg = validateRating(input.rating);
  if (ratingMsg) return ratingMsg;
  return validateNote(input.note);
}

export async function submitFeedback(
  studentId: string,
  input: FeedbackInput,
): Promise<FeedbackResult> {
  const validationMessage = validateFeedback(input);
  if (validationMessage) return { ok: false, error: validationMessage };

  const row = await queryOne<Feedback>(
    `INSERT INTO feedback (student_id, output_version, trace_id, rating, issue, note)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${FEEDBACK_COLUMNS}`,
    [studentId, input.output_version, input.trace_id, input.rating, input.issue, input.note],
  );
  return { ok: true, feedback: row! };
}
