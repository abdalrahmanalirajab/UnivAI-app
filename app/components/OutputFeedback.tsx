"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import ThumbDownOutlined from "@mui/icons-material/ThumbDownOutlined";
import ThumbUpOutlined from "@mui/icons-material/ThumbUpOutlined";
import FlagOutlined from "@mui/icons-material/FlagOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";

/**
 * Feedback on one generated output: thumbs up/down, an issue flag, and a
 * retry button.
 *
 * Feedback posts to the real /api/feedback endpoint (3b) with the output's
 * output_version and trace_id — response is { feedback } on 200 and
 * { error } on 4xx, and the request body mirrors lib/feedback.ts
 * FeedbackInput exactly.
 *
 * Retry posts to the real /api/retry endpoint (3c) with the bookId of the
 * book that produced this output — response is { ok, bookId, status } on
 * 200 and { error } on 4xx.
 */

export default function OutputFeedback({
  outputVersion,
  traceId,
  bookId,
}: {
  outputVersion: string;
  traceId: string;
  bookId: number;
}) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [issue, setIssue] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [retried, setRetried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch("/api/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not retry generation.");
      setRetried(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not retry generation.");
    } finally {
      setRetrying(false);
    }
  }

  async function submit() {
    if (rating === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          output_version: outputVersion,
          trace_id: traceId,
          rating,
          issue,
          note: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send feedback.");
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send feedback.");
    } finally {
      setSubmitting(false);
    }
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
        disabled={submitting}
      >
        <ToggleButton value="up" aria-label="Thumbs up">
          <ThumbUpOutlined />
        </ToggleButton>
        <ToggleButton value="down" aria-label="Thumbs down">
          <ThumbDownOutlined />
        </ToggleButton>
      </ToggleButtonGroup>

      <Stack direction="row" spacing={1}>
        <ToggleButton
          value="issue"
          selected={issue}
          onChange={() => setIssue((current) => !current)}
          disabled={submitting}
        >
          <FlagOutlined />
          Report an issue
        </ToggleButton>

        <Button
          variant="contained"
          disabled={rating === null || submitting}
          onClick={submit}
        >
          Send feedback
        </Button>
      </Stack>

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
