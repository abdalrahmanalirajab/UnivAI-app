"use client";

import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import type { CitationV1 } from "@/test/fixtures/citation-v1";

/**
 * Small inline marker for one citation, rendered next to generated content.
 *
 * The bubble stays dumb: it shows the compact page reference and hands the
 * full citation to the parent through onOpen, so the parent can compose
 * SourcePanel around it. SourcePanel is a separate component of this issue —
 * it is not imported here because it does not exist yet.
 *
 * Rule 8: when the citation carries no real identity (no pages — the only
 * field with a real producer today, see test/fixtures/citation-v1.ts), the
 * bubble renders an explicit "source unavailable" state instead of a
 * fabricated reference, and it is not clickable.
 */

export default function CitationBubble({
  citation,
  onOpen,
}: {
  citation: CitationV1 | null;
  onOpen: (citation: CitationV1) => void;
}) {
  if (citation === null || citation.pages.length === 0) {
    return <Chip size="small" variant="outlined" label="Source unavailable" />;
  }

  const reference =
    citation.pages.length === 1
      ? `p. ${citation.pages[0].page}`
      : `pp. ${citation.pages.map((entry) => entry.page).join(", ")}`;

  return (
    <Tooltip title={citation.bookTitle ?? "Source"}>
      <Chip
        size="small"
        variant="outlined"
        label={reference}
        clickable
        onClick={() => onOpen(citation)}
        aria-label={`Open source ${reference}`}
      />
    </Tooltip>
  );
}
