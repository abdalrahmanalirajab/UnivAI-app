"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { EligibleAbsenceItem, LearnerAbsenceCase } from "@/lib/absence-cases";
import { formatDateTime } from "@/lib/time";

type ResponseBody = {
  cases: LearnerAbsenceCase[];
  eligibleItems: EligibleAbsenceItem[];
};

const OUTCOME_LABEL = {
  excused: "Absent with no grades lost for an approved good cause",
  access_only: "Replay access approved; normal grade rules still apply",
  unexcused: "Absence not accepted",
} as const;

function statusLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export default function AbsencesPage() {
  const [data, setData] = useState<ResponseBody | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/absences", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load absence cases.");
      setData(body as ResponseBody);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load absence cases.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function key(item: Pick<EligibleAbsenceItem, "itemType" | "week">) {
    return `${item.itemType}:${item.week}`;
  }

  async function submit() {
    if (!data) return;
    setBusy("new");
    setError(null);
    try {
      const items = data.eligibleItems
        .filter((item) => selected.includes(key(item)))
        .map(({ itemType, week }) => ({ itemType, week }));
      const response = await fetch("/api/absences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, items }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not submit the absence case.");
      setReason("");
      setSelected([]);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit the absence case.");
    } finally {
      setBusy(null);
    }
  }

  async function respond(absenceCase: LearnerAbsenceCase) {
    setBusy(absenceCase.id);
    setError(null);
    try {
      const response = await fetch(`/api/absences/${absenceCase.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: answers[absenceCase.id] ?? "" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not send clarification.");
      setAnswers((current) => ({ ...current, [absenceCase.id]: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send clarification.");
    } finally {
      setBusy(null);
    }
  }

  async function uploadEvidence(absenceCase: LearnerAbsenceCase, file: File | null) {
    if (!file) return;
    setBusy(absenceCase.id);
    setError(null);
    try {
      const form = new FormData();
      form.set("evidence", file);
      const response = await fetch(`/api/absences/${absenceCase.id}/evidence`, { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not attach evidence.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not attach evidence.");
    } finally {
      setBusy(null);
    }
  }

  if (!data && !error) return <CircularProgress />;

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4">Absence cases</Typography>
        <Typography color="text.secondary">
          If you missed a lecture or quiz, you must give a specific reason. Automated triage is strict, but only a human administrator makes the final decision.
        </Typography>
      </Stack>

      {error ? <Alert severity="error" action={<Button color="inherit" onClick={() => void load()}>Retry</Button>}>{error}</Alert> : null}

      <Alert severity="info">
        Evidence images are never read by AI or sent by email. They are normalized, stored privately, and shown only to authorized admins.
      </Alert>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Report a missed item</Typography>
            {data?.eligibleItems.length ? data.eligibleItems.map((item) => (
              <FormControlLabel
                key={key(item)}
                control={
                  <Checkbox
                    checked={selected.includes(key(item))}
                    onChange={(_event, checked) => setSelected((current) =>
                      checked ? [...current, key(item)] : current.filter((value) => value !== key(item))
                    )}
                  />
                }
                label={item.title}
              />
            )) : (
              <Typography color="text.secondary">No unreported missed lectures or quizzes are currently eligible.</Typography>
            )}
            <TextField
              label="Why were you absent?"
              required
              multiline
              minRows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              helperText={`${reason.trim().length}/2000 characters; at least 20 required`}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
            />
            <Button
              variant="contained"
              onClick={() => void submit()}
              disabled={busy !== null || selected.length === 0 || reason.trim().length < 20}
            >
              {busy === "new" ? "Submitting…" : "Submit for strict review"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Stack spacing={2}>
        <Typography variant="h5">Your cases</Typography>
        {data?.cases.length ? data.cases.map((absenceCase) => (
          <Card key={absenceCase.id} variant="outlined">
            <CardContent>
              <Stack spacing={2}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} className="spread-row">
                  <Stack spacing={0.5}>
                    <Typography variant="h6">
                      {absenceCase.items.map((item) => `${item.itemType} week ${item.week}`).join(" + ")}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Submitted {formatDateTime(absenceCase.submittedAt)}</Typography>
                  </Stack>
                  <Chip
                    color={absenceCase.outcome === "excused" ? "success" : absenceCase.outcome === "unexcused" ? "error" : "default"}
                    label={statusLabel(absenceCase.status)}
                  />
                </Stack>

                {absenceCase.outcome ? (
                  <Alert severity={absenceCase.outcome === "unexcused" ? "error" : "success"}>
                    <AlertTitle>{OUTCOME_LABEL[absenceCase.outcome]}</AlertTitle>
                    {absenceCase.decisionReason}
                  </Alert>
                ) : absenceCase.waitingOn === "admin" ? (
                  <Alert severity="warning">A human administrator has been notified in the app and by email. You are waiting for their decision.</Alert>
                ) : null}

                {absenceCase.status === "needs_clarification" && absenceCase.question ? (
                  <Stack spacing={1}>
                    <Alert severity="warning"><AlertTitle>Clarification required</AlertTitle>{absenceCase.question}</Alert>
                    <TextField
                      label="Your answer"
                      multiline
                      minRows={3}
                      value={answers[absenceCase.id] ?? ""}
                      onChange={(event) => setAnswers((current) => ({ ...current, [absenceCase.id]: event.target.value }))}
                      slotProps={{ htmlInput: { maxLength: 2000 } }}
                    />
                    <Button
                      variant="contained"
                      disabled={busy !== null || (answers[absenceCase.id] ?? "").trim().length < 10}
                      onClick={() => void respond(absenceCase)}
                    >Send clarification</Button>
                  </Stack>
                ) : null}

                {absenceCase.status === "evidence_required" && absenceCase.question ? (
                  <Stack spacing={1}>
                    <Alert severity="warning"><AlertTitle>Human-readable evidence requested</AlertTitle>{absenceCase.question}</Alert>
                    <Button component="label" variant="contained" disabled={busy !== null}>
                      Attach JPEG or PNG
                      <input
                        hidden
                        type="file"
                        accept="image/jpeg,image/png"
                        onChange={(event) => void uploadEvidence(absenceCase, event.target.files?.[0] ?? null)}
                      />
                    </Button>
                  </Stack>
                ) : null}

                {absenceCase.items.some((item) => item.remedy === "replay" && item.lecturePublicId) ? (
                  <Stack direction="row" spacing={1}>
                    {absenceCase.items.filter((item) => item.remedy === "replay" && item.lecturePublicId).map((item) => (
                      <Button key={`${item.itemType}:${item.week}`} component={Link} href={`/lecture/${item.lecturePublicId}/archive`} variant="outlined">
                        Watch week {item.week} any time
                      </Button>
                    ))}
                  </Stack>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        )) : <Typography color="text.secondary">You have not submitted an absence case.</Typography>}
      </Stack>
    </Stack>
  );
}
