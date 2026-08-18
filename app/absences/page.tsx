"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Pagination from "@mui/material/Pagination";
import Typography from "@mui/material/Typography";
import type { EligibleAbsenceItem, LearnerAbsenceCase } from "@/lib/absence-cases";
import { formatDateTime } from "@/lib/time";
import { CREDIT_COSTS } from "@/lib/credit-costs";

type ResponseBody = {
  cases: LearnerAbsenceCase[];
  eligibleItems: EligibleAbsenceItem[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
};

type AppealTarget = Pick<EligibleAbsenceItem, "itemType" | "week">;

const OUTCOME_LABEL = {
  excused: "Absent with no grades lost for an approved good cause",
  access_only: "One-time make-up lecture approved; attendance is graded from what you actually watch",
  unexcused: "Absence not accepted",
} as const;

function statusLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function itemKey(item: AppealTarget): string {
  return `${item.itemType}:${item.week}`;
}

export default function AbsencesPage() {
  return (
    <Suspense fallback={<CircularProgress />}>
      <AbsenceCases />
    </Suspense>
  );
}

function AbsenceCases() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<ResponseBody | null>(null);
  const [reason, setReason] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [casePage, setCasePage] = useState(1);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/absences?page=${casePage}&pageSize=10`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load absence cases.");
      const cases = Array.isArray(body.cases) ? body.cases : [];
      setData({
        ...body,
        cases,
        eligibleItems: Array.isArray(body.eligibleItems) ? body.eligibleItems : [],
        pagination: body.pagination ?? {
          page: casePage,
          pageSize: 10,
          total: cases.length,
          pages: Math.max(1, Math.ceil(cases.length / 10)),
        },
      } as ResponseBody);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load absence cases.");
    }
  }, [casePage]);

  useEffect(() => { void load(); }, [load]);

  const rawItemType = searchParams.get("itemType");
  const rawWeek = searchParams.get("week");
  const requestedWeek = rawWeek === null ? null : Number(rawWeek);
  const target: AppealTarget | null =
    (rawItemType === "lecture" || rawItemType === "quiz") &&
    requestedWeek !== null &&
    Number.isInteger(requestedWeek) &&
    requestedWeek > 0
      ? { itemType: rawItemType, week: requestedWeek }
      : null;
  const targetRequested = rawItemType !== null || rawWeek !== null;
  const targetItem = target
    ? data?.eligibleItems.find((item) => itemKey(item) === itemKey(target)) ?? null
    : null;
  const existingCase = target
    ? data?.cases.find((absenceCase) =>
        absenceCase.items.some((item) => itemKey(item) === itemKey(target))) ?? null
    : null;

  async function submit() {
    if (!targetItem) return;
    setBusy("new");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/absences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          items: [{ itemType: targetItem.itemType, week: targetItem.week }],
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not submit the absence case.");
      setReason("");
      setNotice("Your appeal was submitted. Follow its status below.");
      await load();
      router.replace("/absences");
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
      setNotice("Your reply was sent to the administrator.");
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
      const response = await fetch(`/api/absences/${absenceCase.id}/evidence`, {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not attach evidence.");
      await load();
      setNotice("The requested image is attached. Send your written reply when ready.");
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
        <Typography variant="h4">Attendance &amp; appeals</Typography>
        <Typography color="text.secondary">
          Review your cases here. A new appeal can only start from a lecture marked absent or a
          quiz marked missed.
        </Typography>
      </Stack>

      {error ? (
        <Alert
          severity="error"
          action={<Button color="inherit" onClick={() => void load()}>Retry</Button>}
        >
          {error}
        </Alert>
      ) : null}
      {notice ? <Alert severity="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <Alert severity="info">
        Evidence images are never read by AI or sent by email. They are normalized, stored
        privately, and shown only to authorized admins.
      </Alert>

      {data && targetItem ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                className="spread-row"
              >
                <Stack spacing={0.5}>
                  <Typography variant="h6">Appeal this missed {targetItem.itemType}</Typography>
                  <Typography data-generated-content="true" dir="auto">
                    {targetItem.title}
                  </Typography>
                </Stack>
                <Chip label={`Week ${targetItem.week}`} color="warning" variant="outlined" />
              </Stack>
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
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button
                  variant="contained"
                  onClick={() => void submit()}
                  disabled={busy !== null || reason.trim().length < 20}
                >
                  {busy === "new"
                    ? "Submitting…"
                    : `Submit appeal · ${CREDIT_COSTS.appeal} Credits`}
                </Button>
                <Button
                  component={Link}
                  href={targetItem.itemType === "lecture" ? "/schedule" : "/exams"}
                >
                  Cancel
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ) : data && targetRequested && !target ? (
        <Alert severity="error">
          <AlertTitle>Invalid appeal link</AlertTitle>
          Open the appeal from the missed lecture or quiz instead of entering an item manually.
        </Alert>
      ) : data && target && existingCase ? (
        <Alert severity="info">
          <AlertTitle>Appeal already submitted</AlertTitle>
          This item already belongs to a case. Its latest status appears below.
        </Alert>
      ) : data && target ? (
        <Alert severity="warning">
          <AlertTitle>This item cannot be appealed</AlertTitle>
          It is not recorded as missed, is no longer eligible, or already has a closed case.
        </Alert>
      ) : data ? (
        <Alert
          severity="info"
          action={
            <Button component={Link} href="/schedule" color="inherit" variant="outlined">
              Open schedule
            </Button>
          }
        >
          To start an appeal, open a lecture marked absent or a quiz marked missed and choose
          <strong> Appeal absence</strong>.
        </Alert>
      ) : null}

      <Stack spacing={2}>
        <Typography variant="h5">Your cases</Typography>
        {data?.cases.length ? data.cases.map((absenceCase) => (
          <Card key={absenceCase.id} variant="outlined">
            <CardContent>
              <Stack spacing={2}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  className="spread-row"
                >
                  <Stack spacing={0.5}>
                    <Typography variant="h6">
                      {absenceCase.items
                        .map((item) => `${item.itemType} week ${item.week}`)
                        .join(" + ")}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Submitted {formatDateTime(absenceCase.submittedAt)}
                    </Typography>
                  </Stack>
                  <Chip
                    color={
                      absenceCase.outcome === "excused"
                        ? "success"
                        : absenceCase.outcome === "unexcused"
                          ? "error"
                          : "default"
                    }
                    label={statusLabel(absenceCase.status)}
                  />
                </Stack>

                {absenceCase.outcome ? (
                  <Alert severity={absenceCase.outcome === "unexcused" ? "error" : "success"}>
                    <AlertTitle>{OUTCOME_LABEL[absenceCase.outcome]}</AlertTitle>
                    {absenceCase.decisionReason}
                  </Alert>
                ) : absenceCase.waitingOn === "admin" ? (
                  <Alert severity="warning">
                    A human administrator is reviewing this case. They may decide it or return it
                    with another question.
                  </Alert>
                ) : null}

                {absenceCase.messages.length ? (
                  <Stack spacing={1}>
                    <Typography variant="overline">Case conversation</Typography>
                    {absenceCase.messages.map((message) => (
                      <Alert
                        key={message.id}
                        severity={message.actor === "learner" ? "info" : "warning"}
                      >
                        <AlertTitle>
                          {message.actor === "learner"
                            ? "You"
                            : message.actor === "admin"
                              ? "Administrator"
                              : "System"}
                          {" · "}{formatDateTime(message.createdAt)}
                        </AlertTitle>
                        {message.message}
                        {message.responseRequested ? (
                          <Typography variant="caption" component="span">
                            {message.attachmentRequested
                              ? "A protected image was requested with this reply."
                              : "Text reply requested; no attachment authorized."}
                          </Typography>
                        ) : null}
                      </Alert>
                    ))}
                  </Stack>
                ) : null}

                {absenceCase.pendingRequest ? (
                  <Card variant="outlined">
                    <CardContent>
                      <Stack spacing={1.5}>
                        <Alert severity="warning">
                          <AlertTitle>Administrator requested more information</AlertTitle>
                          {absenceCase.pendingRequest.question}
                        </Alert>
                        {absenceCase.pendingRequest.attachmentRequested ? (
                          absenceCase.pendingRequest.evidenceAttached ? (
                            <Alert severity="success">
                              The requested image is attached securely for human review.
                            </Alert>
                          ) : (
                            <Button component="label" variant="outlined" disabled={busy !== null}>
                              Attach requested JPEG or PNG
                              <input
                                hidden
                                type="file"
                                accept="image/jpeg,image/png"
                                onChange={(event) => void uploadEvidence(
                                  absenceCase,
                                  event.target.files?.[0] ?? null,
                                )}
                              />
                            </Button>
                          )
                        ) : (
                          <Alert severity="info">
                            Reply with text only. The administrator did not authorize an image
                            attachment for this question.
                          </Alert>
                        )}
                        <TextField
                          label="Your reply"
                          multiline
                          minRows={3}
                          value={answers[absenceCase.id] ?? ""}
                          onChange={(event) => setAnswers((current) => ({
                            ...current,
                            [absenceCase.id]: event.target.value,
                          }))}
                          slotProps={{ htmlInput: { maxLength: 2000 } }}
                          helperText="At least 10 characters. Your reply becomes part of the case history."
                        />
                        <Button
                          variant="contained"
                          disabled={
                            busy !== null ||
                            (answers[absenceCase.id] ?? "").trim().length < 10 ||
                            (
                              absenceCase.pendingRequest.attachmentRequested &&
                              !absenceCase.pendingRequest.evidenceAttached
                            )
                          }
                          onClick={() => void respond(absenceCase)}
                        >
                          Send reply to administrator
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                ) : null}

                {absenceCase.items.some(
                  (item) => item.remedy === "makeup_live" && item.lecturePublicId,
                ) ? (
                  <Stack direction="row" spacing={1}>
                    {absenceCase.items
                      .filter((item) => item.remedy === "makeup_live" && item.lecturePublicId)
                      .map((item) => (
                        <Button
                          key={`${item.itemType}:${item.week}`}
                          component={Link}
                          href={`/lecture/${item.lecturePublicId}`}
                          variant="outlined"
                        >
                          Start week {item.week} make-up lecture
                        </Button>
                      ))}
                  </Stack>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        )) : (
          <Typography color="text.secondary">You have not submitted an absence case.</Typography>
        )}
        {data && data.pagination.total > data.pagination.pageSize ? (
          <Pagination
            page={data.pagination.page}
            count={data.pagination.pages}
            onChange={(_event, value) => setCasePage(value)}
            color="primary"
            aria-label="Appeal case pages"
          />
        ) : null}
      </Stack>
    </Stack>
  );
}
