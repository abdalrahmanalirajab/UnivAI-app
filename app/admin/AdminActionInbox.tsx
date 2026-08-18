"use client";

import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import TablePagination from "@mui/material/TablePagination";
import Typography from "@mui/material/Typography";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import type { AdminAction, AbsenceOutcome } from "@/lib/absence-cases";
import { formatDateTime } from "@/lib/time";

type CaseDetail = {
  id: string;
  student: { registrationNumber: string; name: string; email: string };
  status: string;
  waitingOn: "learner" | "admin" | "none";
  reason: string;
  recommendation: string | null;
  suggestedQuestion: string | null;
  policyClauseIds: string[];
  sensitivityFlags: string[];
  adminSummary: string | null;
  aiConfidence: number | null;
  items: Array<{ itemType: string; week: number; remedy: string }>;
  messages: Array<{
    id: string;
    actor: string;
    message: string;
    responseRequested: boolean;
    attachmentRequested: boolean;
    createdAt: string;
  }>;
  evidence: Array<{
    id: string;
    filename: string;
    byteLength: number;
    requestMessageId: string | null;
    createdAt: string;
  }>;
};

const DECISIONS: Array<{ value: AbsenceOutcome; label: string; effect: string }> = [
  { value: "excused", label: "Absent — no grade lost", effect: "Exclude approved items from their grade denominators." },
  { value: "access_only", label: "One-time make-up lecture", effect: "Keep normal grade rules and let the learner start one full interactive lecture at a confirmed time." },
  { value: "unexcused", label: "Absence not accepted", effect: "Keep normal grade rules with no special remedy." },
];

function decisionsFor(selected: CaseDetail | null) {
  return selected?.items[0]?.itemType === "quiz"
    ? DECISIONS.filter((decision) => decision.value !== "access_only")
    : DECISIONS;
}

function title(value: string | null): string {
  return (value ?? "none").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export default function AdminActionInbox() {
  const [actions, setActions] = useState<AdminAction[] | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<CaseDetail | null>(null);
  const [outcome, setOutcome] = useState<AbsenceOutcome>("excused");
  const [reason, setReason] = useState("");
  const [question, setQuestion] = useState("");
  const [attachmentRequested, setAttachmentRequested] = useState(false);
  const [loadingCase, setLoadingCase] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize) });
      const response = await fetch(`/api/admin/actions?${params}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load admin actions.");
      setActions(body.actions as AdminAction[]);
      setTotal(Number(body.pagination?.total ?? body.actions?.length ?? 0));
      const normalizedPage = Math.max(0, Number(body.pagination?.page ?? 1) - 1);
      if (normalizedPage !== page) setPage(normalizedPage);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load admin actions.");
    }
  }, [page, pageSize]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function open(action: AdminAction) {
    setLoadingCase(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/absence-cases/${action.caseId}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load the absence case.");
      const detail = body.case as CaseDetail;
      setSelected(detail);
      setOutcome("excused");
      setReason("");
      setQuestion(detail.suggestedQuestion ?? "");
      setAttachmentRequested(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the absence case.");
    } finally {
      setLoadingCase(false);
    }
  }

  async function decide() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/absence-cases/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decide", outcome, reason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the decision.");
      setSelected(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the decision.");
    } finally {
      setSaving(false);
    }
  }

  async function requestMoreInformation() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/absence-cases/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_information",
          question,
          attachmentRequested,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not request more information.");
      setSelected(body.case as CaseDetail);
      setQuestion("");
      setAttachmentRequested(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not request more information.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card id="actions" variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} className="spread-row">
            <Stack direction="row" spacing={1} className="align-center">
              <FactCheckOutlined color="primary" />
              <Stack spacing={0}>
                <Typography variant="h5">Admin action inbox</Typography>
                <Typography variant="body2" color="text.secondary">
                  Decisions learners are waiting for. Admin email alerts link back here.
                </Typography>
              </Stack>
            </Stack>
            <Button onClick={() => void load()} disabled={actions === null}>Refresh</Button>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {actions === null ? <CircularProgress size={26} /> : actions.length === 0 ? (
            <Alert severity="success">No learner is waiting for an administrative action.</Alert>
          ) : actions.map((action) => (
            <Card key={action.id} variant="outlined">
              <CardContent>
                <Stack direction={{ xs: "column", md: "row" }} spacing={2} className="spread-row">
                  <Stack spacing={0.5}>
                    <Stack direction="row" spacing={1} className="align-center">
                      <Typography variant="subtitle1">{action.title}</Typography>
                      <Chip size="small" color={action.priority === "high" ? "warning" : "default"} label={title(action.priority)} />
                      <Chip
                        size="small"
                        color={action.waitingOn === "learner" ? "info" : "warning"}
                        variant="outlined"
                        label={`Waiting on ${action.waitingOn}`}
                      />
                    </Stack>
                    <Typography>{action.studentName} · {action.studentId}</Typography>
                    <Typography variant="body2" color="text.secondary">{action.safeSummary}</Typography>
                    <Typography variant="caption" color="text.secondary">Waiting since {formatDateTime(action.createdAt)}</Typography>
                  </Stack>
                  <Button variant="contained" onClick={() => void open(action)} disabled={loadingCase}>
                    Review case
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
          {actions !== null && total > 0 ? (
            <TablePagination
              component="div"
              count={total}
              page={page}
              rowsPerPage={pageSize}
              rowsPerPageOptions={[5, 10, 25]}
              onPageChange={(_event, nextPage) => setPage(nextPage)}
              onRowsPerPageChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
              labelRowsPerPage="Actions per page"
            />
          ) : null}
        </Stack>
      </CardContent>

      <Dialog open={Boolean(selected)} onClose={() => !saving && setSelected(null)} fullWidth maxWidth="md">
        <DialogTitle>Human absence review</DialogTitle>
        <DialogContent dividers>
          {selected ? (
            <Stack spacing={2}>
              <Alert severity="warning">
                <AlertTitle>AI advice is non-binding</AlertTitle>
                Review the learner statement and any protected evidence yourself. Do not infer document authenticity from the AI recommendation.
              </Alert>
              <Stack spacing={0.5}>
                <Typography variant="h6">{selected.student.name}</Typography>
                <Typography color="text.secondary">{selected.student.registrationNumber} · {selected.student.email}</Typography>
                <Typography>{selected.items.map((item) => `${item.itemType} week ${item.week}`).join(" + ")}</Typography>
              </Stack>
              <Divider />
              <Stack spacing={0.5}>
                <Typography variant="overline">Learner statement</Typography>
                <Typography>{selected.reason}</Typography>
              </Stack>
              <Stack spacing={0.5}>
                <Typography variant="overline">Strict triage recommendation</Typography>
                <Typography>{title(selected.recommendation)} · confidence {selected.aiConfidence === null ? "unavailable" : `${Math.round(selected.aiConfidence * 100)}%`}</Typography>
                <Typography variant="body2">{selected.adminSummary}</Typography>
                <Stack direction="row" spacing={1} className="wrap-row">
                  {selected.policyClauseIds.map((clause) => <Chip key={clause} size="small" variant="outlined" label={clause} />)}
                  {selected.sensitivityFlags.map((flag) => <Chip key={flag} size="small" color="warning" label={title(flag)} />)}
                </Stack>
              </Stack>
              {selected.messages.length ? (
                <Stack spacing={1}>
                  <Typography variant="overline">Case conversation</Typography>
                  {selected.messages.map((message, index) => (
                    <Alert key={`${message.createdAt}:${index}`} severity={message.actor === "learner" ? "info" : "warning"}>
                      <AlertTitle>{title(message.actor)} · {formatDateTime(message.createdAt)}</AlertTitle>
                      {message.message}
                      {message.responseRequested ? (
                        <Stack direction="row" spacing={1} className="wrap-row">
                          <Chip size="small" label="Reply requested" />
                          <Chip
                            size="small"
                            color={message.attachmentRequested ? "warning" : "default"}
                            label={message.attachmentRequested ? "Image required" : "Text only"}
                          />
                        </Stack>
                      ) : null}
                    </Alert>
                  ))}
                </Stack>
              ) : null}
              {selected.evidence.length ? (
                <Stack spacing={1}>
                  <Typography variant="overline">Protected evidence — human review only</Typography>
                  {selected.evidence.map((evidence) => (
                    <Button
                      key={evidence.id}
                      component="a"
                      href={`/api/admin/absence-evidence/${evidence.id}`}
                      target="_blank"
                      rel="noreferrer"
                      variant="outlined"
                    >
                      Open {evidence.filename} ({Math.ceil(evidence.byteLength / 1024)} KB)
                    </Button>
                  ))}
                </Stack>
              ) : <Typography color="text.secondary">No administrator-requested image is attached.</Typography>}
              <Divider />
              {selected.waitingOn === "learner" ? (
                <Alert severity="info">
                  <AlertTitle>Waiting for the learner</AlertTitle>
                  The final decision and another question unlock after the learner sends this
                  reply. An image upload is available only if your latest question required it.
                </Alert>
              ) : (
                <>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack spacing={1.5}>
                        <Stack spacing={0.25}>
                          <Typography variant="h6">Ask for more information</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Return the case to the learner with one precise question. You can
                            repeat this after each reply.
                          </Typography>
                        </Stack>
                        <TextField
                          label="Question shown to learner"
                          multiline
                          minRows={3}
                          value={question}
                          onChange={(event) => setQuestion(event.target.value)}
                          slotProps={{ htmlInput: { maxLength: 2000 } }}
                          helperText="At least 10 characters. The learner is notified by email and in this case history."
                        />
                        <FormControlLabel
                          control={(
                            <Checkbox
                              checked={attachmentRequested}
                              onChange={(event) => setAttachmentRequested(event.target.checked)}
                            />
                          )}
                          label="Require one JPEG or PNG image with the learner's reply"
                        />
                        <Alert severity={attachmentRequested ? "warning" : "info"}>
                          {attachmentRequested
                            ? "This explicitly unlocks one protected image upload for this question only."
                            : "The learner will have no attachment control and the upload API remains locked."}
                        </Alert>
                        <Button
                          variant="outlined"
                          color="warning"
                          disabled={saving || question.trim().length < 10}
                          onClick={() => void requestMoreInformation()}
                        >
                          {saving ? "Sending…" : "Send question to learner"}
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>

                  <Divider>or make the final decision</Divider>
              <TextField select label="Final decision" value={outcome} onChange={(event) => setOutcome(event.target.value as AbsenceOutcome)}>
                {decisionsFor(selected).map((decision) => (
                  <MenuItem key={decision.value} value={decision.value}>{decision.label}</MenuItem>
                ))}
              </TextField>
              <Alert severity="info">{decisionsFor(selected).find((decision) => decision.value === outcome)?.effect}</Alert>
              <TextField
                label="Decision reason shown to learner"
                required
                multiline
                minRows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 2000 } }}
                helperText="At least 10 characters. This becomes part of the case record and email."
              />
                </>
              )}
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)} disabled={saving}>
            {selected?.waitingOn === "learner" ? "Close" : "Cancel"}
          </Button>
          {selected?.waitingOn === "admin" ? (
            <Button variant="contained" onClick={() => void decide()} disabled={saving || reason.trim().length < 10}>
              {saving ? "Saving…" : "Record final decision"}
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>
    </Card>
  );
}
