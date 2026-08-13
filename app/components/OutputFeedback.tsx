"use client";

import { useEffect, useId, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Rating from "@mui/material/Rating";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ThumbUpOutlined from "@mui/icons-material/ThumbUpOutlined";
import ReportProblemOutlined from "@mui/icons-material/ReportProblemOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";
import {
  AI_OUTPUT_REPORT_REASONS,
  AI_OUTPUT_REPORT_REASON_LABELS,
  type AiOutputReportReason,
  type AiOutputTarget,
} from "@/lib/ai-output-feedback-types";
import type { OutputVersion } from "@/lib/feedback";

type FeedbackAction =
  | { action: "rating"; rating: number }
  | { action: "like"; liked: boolean }
  | { action: "report"; reason: AiOutputReportReason; detail: string | null };

export default function OutputFeedback({
  target = null,
  retryOutputId = null,
  onRetried,
}: {
  target?: AiOutputTarget | null;
  retryOutputId?: number | null;
  onRetried?: (output: OutputVersion) => void;
}) {
  const reportLabelId = useId();
  const available = Boolean(
    target?.targetId && target.targetVersion && target.traceId,
  );
  const targetKey = target
    ? `${target.targetType}:${target.targetId}:${target.targetVersion}:${target.traceId}`
    : "unavailable";
  const [rating, setRating] = useState<number | null>(null);
  const [ratingSaved, setRatingSaved] = useState(false);
  const [liked, setLiked] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<AiOutputReportReason | "">("");
  const [reportDetail, setReportDetail] = useState("");
  const [reported, setReported] = useState(false);
  const [submitting, setSubmitting] = useState<"rating" | "like" | "report" | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retried, setRetried] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRating(null);
    setRatingSaved(false);
    setLiked(false);
    setReportOpen(false);
    setReportReason("");
    setReportDetail("");
    setReported(false);
    setMessage(null);
    setError(null);
  }, [targetKey]);

  async function post(action: FeedbackAction) {
    if (!target) throw new Error("This output cannot be identified yet.");
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_type: target.targetType,
        target_id: target.targetId,
        target_version: target.targetVersion,
        trace_id: target.traceId,
        ...action,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "Could not send feedback.");
  }

  async function saveRating() {
    if (!available || rating === null) return;
    setSubmitting("rating");
    setError(null);
    try {
      await post({ action: "rating", rating });
      setRatingSaved(true);
      setMessage("Thanks — your rating was saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save rating.");
    } finally {
      setSubmitting(null);
    }
  }

  async function toggleLike() {
    if (!available) return;
    const next = !liked;
    setSubmitting("like");
    setError(null);
    try {
      await post({ action: "like", liked: next });
      setLiked(next);
      setMessage(next ? "Thanks — you liked this output." : "Like removed.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save like.");
    } finally {
      setSubmitting(null);
    }
  }

  async function submitReport() {
    if (!available || !reportReason) return;
    setSubmitting("report");
    setError(null);
    try {
      await post({
        action: "report",
        reason: reportReason,
        detail: reportDetail.trim() || null,
      });
      setReported(true);
      setReportOpen(false);
      setMessage("Report submitted for review.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit report.");
    } finally {
      setSubmitting(null);
    }
  }

  async function retry() {
    if (!retryOutputId) return;
    setRetrying(true);
    setError(null);
    try {
      const response = await fetch(`/api/outputs/${retryOutputId}/retry`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not retry generation.");
      if (!body.output) throw new Error("Retry did not return a new output version.");
      setRetried(true);
      onRetried?.(body.output as OutputVersion);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not retry generation.");
    } finally {
      setRetrying(false);
    }
  }

  if (!available && !retryOutputId) {
    return (
      <Typography variant="body2" color="text.secondary">
        Feedback is unavailable because this output has no recorded identifiers yet.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5} aria-label="AI output feedback">
      {available ? (
        <>
          <Stack spacing={0.5}>
            <Typography id={`${reportLabelId}-rating`} variant="overline" color="text.secondary">
              Rate this AI output
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Rating
                name={`${reportLabelId}-stars`}
                value={rating}
                onChange={(_event, value) => {
                  setRating(value);
                  setRatingSaved(false);
                }}
                getLabelText={(value) => `${value} star${value === 1 ? "" : "s"}`}
                aria-labelledby={`${reportLabelId}-rating`}
                disabled={submitting !== null}
              />
              <Button
                size="small"
                variant="contained"
                disabled={rating === null || submitting !== null || ratingSaved}
                onClick={saveRating}
              >
                {ratingSaved ? "Rating saved" : "Save rating"}
              </Button>
            </Stack>
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button
              variant={liked ? "contained" : "outlined"}
              startIcon={<ThumbUpOutlined />}
              aria-pressed={liked}
              disabled={submitting !== null}
              onClick={toggleLike}
            >
              {liked ? "Liked" : "Like"}
            </Button>
            <Button
              variant="outlined"
              color="warning"
              startIcon={<ReportProblemOutlined />}
              disabled={submitting !== null || reported}
              onClick={() => setReportOpen(true)}
            >
              {reported ? "Reported" : "Report"}
            </Button>
          </Stack>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Feedback is unavailable because this output has no recorded identifiers yet.
        </Typography>
      )}

      {retryOutputId ? (
        <Button
          variant="outlined"
          startIcon={<ReplayOutlined />}
          disabled={retrying || retried}
          onClick={retry}
        >
          {retried ? "Retry started" : "Retry generation"}
        </Button>
      ) : null}

      {message ? <Alert severity="success">{message}</Alert> : null}
      {retried ? <Alert severity="info">Retry started — generation is running.</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Dialog
        open={reportOpen}
        onClose={() => submitting !== "report" && setReportOpen(false)}
        aria-labelledby={`${reportLabelId}-title`}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id={`${reportLabelId}-title`}>Report this AI output</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Choose the main reason. A report can be submitted without a rating or like.
            </Typography>
            <FormControl required fullWidth>
              <InputLabel id={`${reportLabelId}-reason-label`}>Reason</InputLabel>
              <Select
                labelId={`${reportLabelId}-reason-label`}
                label="Reason"
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value as AiOutputReportReason)}
                disabled={submitting === "report"}
              >
                {AI_OUTPUT_REPORT_REASONS.map((reason) => (
                  <MenuItem key={reason} value={reason}>
                    {AI_OUTPUT_REPORT_REASON_LABELS[reason]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Additional detail (optional)"
              multiline
              minRows={3}
              value={reportDetail}
              onChange={(event) => setReportDetail(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
              helperText={`${reportDetail.length}/2000`}
              disabled={submitting === "report"}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReportOpen(false)} disabled={submitting === "report"}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!reportReason || submitting === "report"}
            onClick={submitReport}
          >
            Submit report
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
