/**
 * Citation v1 — Day-1 fixture.
 *
 * Temporary source of truth for the citation shape rendered by CitationBubble
 * and SourcePanel next to generated output. Swap for real generation-pipeline
 * data later without changing field names.
 *
 * Only `pages` has a real producer in this repo today: the per-segment
 * `citations: { page: number }[]` from script.json (lib/lectures.ts `Segment`,
 * validated by lib/standalone-contracts.ts `validateScript`) and the
 * `qa_log.citations` JSONB column. `documentId`, `bookTitle` and `excerpt`
 * have no producer yet — they are declared nullable so consumers render the
 * explicit "source unavailable" state instead of guessing (issue rule 8).
 *
 * Schema version: 1.0.0
 */

export type CitationV1 = {
  /** documents.id (collections schema) / SourceCoverage.document_id — null when unknown. */
  documentId: number | null;
  /** Book title. No producer exists yet — null means "source unavailable". */
  bookTitle: string | null;
  /** Real shape today: script.json `citations` / qa_log.citations. */
  pages: { page: number }[];
  /** Quoted excerpt. No producer exists yet — null means "source unavailable". */
  excerpt: string | null;
};
