"use client";

import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import { isCitationResolvable, type CitationV1 } from "@/test/fixtures/citation-v1";

/**
 * Small inline marker for one citation, rendered next to generated content.
 *
 * The bubble stays dumb: it shows the compact page reference and hands the
 * full citation to the parent through onOpen, so the parent can compose
 * SourcePanel around it.
 *
 * Keyboard access: a clickable Chip renders as a native ButtonBase
 * (node_modules/@mui/material/Chip — `component = clickable || onDelete ?
 * ButtonBase : 'div'`), so the bubble is Tab-focusable and opens with Enter
 * or Space, and the app's theme-provided focus-visible ring
 * (app/theme.ts `:focus-visible`) applies with no custom styling.
 *
 * `expanded` drives aria-expanded: the open state lives in the parent (the
 * component that composes SourcePanel), so the parent must pass it for the
 * attribute to be truthful. The bubble defaults to false rather than
 * claiming an open panel it cannot see.
 *
 * Rule 8: when the citation carries no database-backed book/page identity, the
 * bubble renders an explicit "source unavailable" state instead of a
 * fabricated reference, and it is not clickable (a non-clickable Chip
 * renders a div, so it is not focusable and cannot claim to open anything).
 */

export default function CitationBubble({
  citation,
  onOpen,
  expanded = false,
}: {
  citation: CitationV1 | null;
  onOpen: (citation: CitationV1) => void;
  expanded?: boolean;
}) {
  if (!isCitationResolvable(citation)) {
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
        aria-expanded={expanded}
      />
    </Tooltip>
  );
}
