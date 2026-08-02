import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isCitationResolvable, type CitationV1 } from "@/test/fixtures/citation-v1";

/**
 * Side panel showing one citation: book title, page/section, and the
 * supporting excerpt. Pure presentation — the citation arrives as a prop
 * (CitationV1, test/fixtures/citation-v1.ts); no data-fetching here.
 *
 * Rule 8: only `pages` has a real producer today (script.json segment
 * citations). `bookTitle` and `excerpt` are null until the generation
 * pipeline emits them, so each renders an explicit "…unavailable" state
 * instead of a fabricated value. A citation with no pages at all renders
 * the full source-unavailable state and nothing else.
 */

export default function SourcePanel({ citation }: { citation: CitationV1 | null }) {
  if (!isCitationResolvable(citation)) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Typography variant="overline" color="text.secondary">
            Source
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Source unavailable — no citation data was produced for this answer.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const pages =
    citation.pages.length === 1
      ? `p. ${citation.pages[0].page}`
      : `pp. ${citation.pages.map((entry) => entry.page).join(", ")}`;

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="overline" color="text.secondary">
            Source
          </Typography>

          <Stack spacing={0.5}>
            <Typography variant="overline" color="text.secondary">
              Book
            </Typography>
            <Typography variant="body1">
              {citation.bookTitle ?? "Book title unavailable"}
            </Typography>
          </Stack>

          <Stack spacing={0.5}>
            <Typography variant="overline" color="text.secondary">
              Page
            </Typography>
            <Typography variant="body1">{pages}</Typography>
          </Stack>

          <Stack spacing={0.5}>
            <Typography variant="overline" color="text.secondary">
              Excerpt
            </Typography>
            <Typography variant="body1">
              {citation.excerpt ?? "Excerpt unavailable"}
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
