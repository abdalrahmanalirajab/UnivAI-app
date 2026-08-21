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
import type { LiveAnswerTurn } from "@/lib/live-conversation";
import { CREDIT_COSTS } from "@/lib/credit-costs";

type FeedbackAction =
  | { action: "like"; liked: boolean }
  | { action: "report"; reason: AiOutputReportReason; detail: string | null };

export default function OutputFeedback({
  target = null,
  onRegenerated,
  allowRegenerate = true,
  initialFeedbackSent = false,
  onFeedbackSent,
}: {
  target?: AiOutputTarget | null;
  onRegenerated?: (turn: LiveAnswerTurn, output: OutputVersion) => void;
  allowRegenerate?: boolean;
  initialFeedbackSent?: boolean;
  onFeedbackSent?: () => void;
}) {
  const reportLabelId = useId();
  const available = Boolean(
    target?.targetId && target.targetVersion && target.traceId,
  );
  const targetKey = target
    ? `${target.targetType}:${target.targetId}:${target.targetVersion}:${target.traceId}`
    : "unavailable";
  const [feedbackSent, setFeedbackSent] = useState(initialFeedbackSent);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<AiOutputReportReason | "">("");
  const [reportDetail, setReportDetail] = useState("");
  const [submitting, setSubmitting] = useState<"like" | "report" | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFeedbackSent(initialFeedbackSent);
    setReportOpen(false);
    setReportReason("");
    setReportDetail("");
    setMessage(null);
    setError(null);
  }, [initialFeedbackSent, targetKey]);

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

  async function submitLike() {
    if (!available) return;
    setSubmitting("like");
    setError(null);
    try {
      await post({ action: "like", liked: true });
      setFeedbackSent(true);
      onFeedbackSent?.();
      setMessage("Thanks — you liked this output.");
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
      setFeedbackSent(true);
      onFeedbackSent?.();
      setReportOpen(false);
      setMessage("Thank you — your report was submitted for review.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit report.");
    } finally {
      setSubmitting(null);
    }
  }

  const regenerationAnswerId =
    allowRegenerate && target?.targetType === "raise_hand_answer" && /^\d+$/.test(target.targetId)
      ? Number(target.targetId)
      : null;

  async function regenerate() {
    if (!regenerationAnswerId) return;
    setRegenerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/answers/${regenerationAnswerId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not regenerate this answer.");
      if (!body.output || !body.turn) {
        throw new Error("Regeneration did not return a grounded answer.");
      }
      onRegenerated?.(body.turn as LiveAnswerTurn, body.output as OutputVersion);
      setMessage(`Answer regenerated for ${CREDIT_COSTS.answer_regeneration} Credits.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not regenerate this answer.");
    } finally {
      setRegenerating(false);
    }
  }

  if (!available) {
    return (
      <Typography variant="body2" color="text.secondary">
        Feedback is unavailable because this output has no recorded identifiers yet.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5} aria-label="AI output feedback">
      {available && !feedbackSent ? (
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<ThumbUpOutlined />}
            disabled={submitting !== null}
            onClick={submitLike}
          >
            Like
          </Button>
          <Button
            variant="outlined"
            color="warning"
            startIcon={<ReportProblemOutlined />}
            disabled={submitting !== null}
            onClick={() => setReportOpen(true)}
          >
            Report
          </Button>
        </Stack>
      ) : !available ? (
        <Typography variant="body2" color="text.secondary">
          Feedback is unavailable because this output has no recorded identifiers yet.
        </Typography>
      ) : null}

      {regenerationAnswerId ? (
        <Button
          variant="outlined"
          startIcon={<ReplayOutlined />}
          disabled={regenerating}
          onClick={regenerate}
        >
          {regenerating
            ? "Regenerating…"
            : `Regenerate · ${CREDIT_COSTS.answer_regeneration} Credits`}
        </Button>
      ) : null}

      {message ? <Alert severity="success">{message}</Alert> : null}
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
              Choose the main reason. Reporting is separate from liking this output.
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
