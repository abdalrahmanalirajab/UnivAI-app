import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import { isCitationResolvable, type CitationV1 } from "@/test/fixtures/citation-v1";

/**
 * Side panel showing one citation: book title, page/section, and the
 * supporting excerpt. Pure presentation — the citation arrives as a prop
 * (CitationV1, test/fixtures/citation-v1.ts); no data-fetching here.
 *
 * Access: the panel is a real dialog (`role="dialog"` + `aria-label`) with a
 * real close control (`aria-label="Close"`) when the parent passes `onClose`.
 * Escape also closes it (handled on the card). When the parent hosts the
 * panel in a MUI Drawer (as TranscriptReview does), the Drawer's Modal
 * already closes on Escape and restores focus to the opening element by
 * default, so focus returns to the bubble that opened the panel.
 *
 * Rule 8: only `pages` has a real producer today (script.json segment
 * citations). `bookTitle` and `excerpt` are null until the generation
 * pipeline emits them, so each renders an explicit "…unavailable" state
 * instead of a fabricated value. A citation with no pages at all renders
 * the full source-unavailable state and nothing else.
 */

export default function SourcePanel({
  citation,
  onClose,
}: {
  citation: CitationV1 | null;
  onClose?: () => void;
}) {
  const header = (
    <Grid container spacing={1}>
      <Grid>
        <Typography variant="overline" color="text.secondary">
          Source
        </Typography>
      </Grid>
      {onClose ? (
        <Grid>
          <IconButton
            size="small"
            aria-label="Close"
            onClick={onClose}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
            }}
          >
            <CloseIcon />
          </IconButton>
        </Grid>
      ) : null}
    </Grid>
  );

  if (!isCitationResolvable(citation)) {
    return (
      <Card
        variant="outlined"
        role="dialog"
        aria-label="Source"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose?.();
        }}
      >
        <CardContent>
          <Stack spacing={2}>
            {header}
            <Typography variant="body2" color="text.secondary">
              Source unavailable — no citation data was produced for this answer.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  const pages =
    citation.pages.length === 1
      ? `p. ${citation.pages[0].page}`
      : `pp. ${citation.pages.map((entry) => entry.page).join(", ")}`;

  return (
    <Card
      variant="outlined"
      role="dialog"
      aria-label="Source"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose?.();
      }}
    >
      <CardContent>
        <Stack spacing={2}>
          {header}

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
