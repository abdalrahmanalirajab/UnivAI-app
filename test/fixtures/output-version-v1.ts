/**
 * Output version v1 — Day-1 fixture.
 *
 * Temporary source of truth for the versioned-output shape that a retry
 * (app/api/outputs/[outputId]/retry/route.ts) produces and feedback
 * (lib/feedback.ts) links to.
 * Swap for real generation-pipeline data later without changing field names.
 *
 * Field names match the persisted output_versions contract in lib/feedback.ts.
 *
 * Schema version: 1.0.0
 */

export type OutputVersionStatus = "pending" | "ready" | "failed";

export type OutputVersionV1 = {
  /** Version of the generated output, e.g. "1.0.0". */
  output_version: string;
  /** Trace id of the generation run. */
  trace_id: string;
  /** Real vocabulary today: books.status literals (subset). */
  status: OutputVersionStatus;
  /** Real citation shape today: script.json citations / qa_log.citations. */
  pages: { page: number }[];
};

/**
 * Rule 8: a versioned output is resolvable only when it carries a real
 * version and trace id (format rules mirror lib/feedback.ts
 * validateOutputVersion / validateTraceId), is marked "ready" (the real
 * books.status literal), and cites real page numbers (integer checks mirror
 * lib/standalone-contracts.ts `validateScript`). Anything else renders the
 * explicit "source unavailable" state instead of a guess.
 */
export function isOutputVersionResolvable(
  output: OutputVersionV1 | null,
): output is OutputVersionV1 {
  return (
    output !== null &&
    output.output_version.trim().length > 0 &&
    output.trace_id.trim().length > 0 &&
    output.status === "ready" &&
    output.pages.length > 0 &&
    output.pages.every((entry) => Number.isInteger(entry.page) && entry.page > 0)
  );
}
