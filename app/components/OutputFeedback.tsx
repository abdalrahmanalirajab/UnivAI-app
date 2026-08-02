"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import ThumbDownOutlined from "@mui/icons-material/ThumbDownOutlined";
import ThumbUpOutlined from "@mui/icons-material/ThumbUpOutlined";
import FlagOutlined from "@mui/icons-material/FlagOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";
import type { OutputVersion } from "@/lib/feedback";

/**
 * Feedback on one generated output: thumbs up/down, an issue flag, and a
 * retry button.
 *
 * Feedback posts to the real /api/feedback endpoint (3b) with the output's
 * output_version and trace_id — response is { feedback } on 200 and
 * { error } on 4xx, and the request body mirrors lib/feedback.ts
 * FeedbackInput exactly.
 *
 * Retry posts to /api/outputs/:outputId/retry. The route persists a new
 * version before starting generation and returns that new identity while the
 * previous version remains addressable.
 *
 * Keyboard access: every control is a native MUI button — Tab-focusable,
 * Enter/Space activates, theme-provided focus-visible ring. MUI sets real
 * `aria-pressed` on the toggle buttons; the thumbs group is labeled with
 * `aria-label="Rating"`; success/error feedback renders in MUI Alerts with
 * the default `role="alert"` so results are announced.
 */

export default function OutputFeedback({
  outputId = null,
  outputVersion = null,
  traceId = null,
  bookId = null,
  onRetried,
}: {
  outputId?: number | null;
  outputVersion?: string | null;
  traceId?: string | null;
  bookId?: number | null;
  onRetried?: (output: OutputVersion) => void;
}) {
  const available =
    outputId !== null && outputVersion !== null && traceId !== null && bookId !== null;
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [issue, setIssue] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [retried, setRetried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!available || rating === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          output_id: outputId,
          output_version: outputVersion,
          trace_id: traceId,
          rating,
          issue,
          note: null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not send feedback.");
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send feedback.");
    } finally {
      setSubmitting(false);
    }
  }

  async function retry() {
    if (!available) return;
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/outputs/${outputId}/retry`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not retry generation.");
      if (!data.output) throw new Error("Retry did not return a new output version.");
      setRetried(true);
      onRetried?.(data.output as OutputVersion);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not retry generation.");
    } finally {
      setRetrying(false);
    }
  }

  if (!available) {
    return (
      <Typography variant="body2" color="text.secondary">
        Feedback and retry are unavailable — this output has no recorded
        identifiers yet.
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      <Typography variant="overline" color="text.secondary">
        Was this answer helpful?
      </Typography>

      <ToggleButtonGroup
        exclusive
        value={rating}
        onChange={(_event, value) => setRating(value as "up" | "down" | null)}
        disabled={submitting || submitted}
        aria-label="Rating"
      >
        <ToggleButton value="up" aria-label="Thumbs up">
          <ThumbUpOutlined />
        </ToggleButton>
        <ToggleButton value="down" aria-label="Thumbs down">
          <ThumbDownOutlined />
        </ToggleButton>
      </ToggleButtonGroup>

      <Grid container spacing={1}>
        <Grid>
          <ToggleButton
            value="issue"
            selected={issue}
            onChange={() => setIssue((current) => !current)}
            disabled={submitting || submitted}
          >
            <FlagOutlined />
            Report an issue
          </ToggleButton>
        </Grid>

        <Grid>
          <Button
            variant="contained"
            disabled={rating === null || submitting || submitted}
            onClick={submit}
          >
            Send feedback
          </Button>
        </Grid>
      </Grid>

      <Stack direction="row" spacing={1}>
        <Button
          variant="outlined"
          startIcon={<ReplayOutlined />}
          disabled={retrying || retried}
          onClick={retry}
        >
          {retried ? "Retry started" : "Retry"}
        </Button>
      </Stack>

      {submitted ? (
        <Alert severity="success">Thanks — feedback sent.</Alert>
      ) : null}
      {retried ? (
        <Alert severity="info">Retry started — the course is being regenerated.</Alert>
      ) : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
    </Stack>
  );
}
