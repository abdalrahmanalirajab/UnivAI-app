/**
 * Citation v1 — Day-1 fixture.
 *
 * Temporary source of truth for the citation shape rendered by CitationBubble
 * and SourcePanel next to generated output. Swap for real generation-pipeline
 * data later without changing field names.
 *
 * The App resolves page citations through qa_log -> lectures -> books. A
 * source is actionable only when that database-backed document identity,
 * title and page are all present. Excerpts remain nullable because older
 * qa_log rows contain page-only citations.
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

/**
 * Rule 8: a citation is resolvable only if every page entry carries a real,
 * valid page number (the sole producer-backed identity). Malformed entries
 * make the citation ambiguous, so consumers render the explicit
 * "source unavailable" state instead of guessing. Mirrors the integer
 * checks in lib/standalone-contracts.ts `validateScript`.
 */
export function isCitationResolvable(citation: CitationV1 | null): citation is CitationV1 {
  return (
    citation !== null &&
    Number.isInteger(citation.documentId) &&
    Number(citation.documentId) > 0 &&
    typeof citation.bookTitle === "string" &&
    citation.bookTitle.trim().length > 0 &&
    citation.pages.length > 0 &&
    citation.pages.every((entry) => Number.isInteger(entry.page) && entry.page > 0)
  );
}
