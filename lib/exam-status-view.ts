import type { ExamServiceStatusV1 } from "./exams";

/**
 * Client-safe presentation of the final exam's status, built directly on the
 * Phase 1 contract (ExamServiceStatusV1 in lib/exams.ts) and Phase 3's state
 * semantics. The contract type is imported with `import type` (erased at
 * build time), so this module carries no server dependency and is safe for
 * MUI client components. The state values ARE the contract's own: a summary
 * never re-derives or re-decides a state, it only labels the one the Exam
 * service reported (and the app cached from its verified callbacks).
 */

/** One short label per contract state — the dashboard's summary status. */
export const FINAL_STATE_SUMMARY: Record<ExamServiceStatusV1["state"], string> = {
  locked: "final locked",
  ready: "final ready",
  active: "in progress",
  submitted: "submitted",
  "awaiting-grade": "awaiting grade",
  graded: "graded",
  flagged: "flagged",
  unavailable: "not available",
};

/** The same severity mapping Phase 3 uses on the exams page. */
export const FINAL_STATE_COLOR: Record<
  ExamServiceStatusV1["state"],
  "default" | "success" | "error" | "warning"
> = {
  locked: "error",
  ready: "default",
  active: "success",
  submitted: "default",
  "awaiting-grade": "warning",
  graded: "success",
  flagged: "error",
  unavailable: "default",
};
