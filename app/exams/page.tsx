"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import { formatCountdown, formatDateTime, formatRelative, useVirtualClock } from "@/lib/time";

type Exam = {
  kind: "quiz" | "mid";
  week: number | null;
  title: string;
  opensAt: string;
  closesAt: string;
  state: "locked" | "open" | "missed" | "submitted";
  score: string | null;
  maxScore: string | null;
  flagged: boolean;
  feedback: string | null;
  report: Report | null;
};

const STATE_COLOR: Record<Exam["state"], "default" | "success" | "error" | "warning"> = {
  locked: "default",
  open: "success",
  missed: "error",
  submitted: "default",
};

/** The final exam's status exactly as the server relayed it from the Exam service. */
type FinalExam = {
  exam_id: string;
  title: string;
  type: "final";
  state:
    | "locked"
    | "ready"
    | "active"
    | "submitted"
    | "awaiting-grade"
    | "graded"
    | "flagged"
    | "unavailable";
  reason: string | null;
  result: { mark: number; max_score: number; passed: boolean } | null;
};

type FinalWindow = {
  opensAt: string | null;
  closesAt: string | null;
  retakeRequestDeadline: string | null;
  phase: "unscheduled" | "scheduled" | "primary-open" | "request-open" | "closed";
};

type FinalCase = {
  primaryOpensAt: string;
  primaryClosesAt: string;
  requestDeadline: string;
  primarySubmitted: boolean;
  provisionalResult: { mark: number; maxScore: number; passed: boolean } | null;
  retakeRequestedAt: string | null;
  retakeAvailableAt: string | null;
  retakeClosesAt: string | null;
  declineReason: string | null;
  finalizedAt: string | null;
  officialResult: { mark: number; maxScore: number; passed: boolean } | null;
  officialAbsent: boolean;
  phase:
    | "scheduled"
    | "primary-open"
    | "request-open"
    | "retake-waiting"
    | "retake-open"
    | "awaiting-grade"
    | "declined"
    | "finalized";
  canStartPrimary: boolean;
  canRequestRetake: boolean;
  canStartRetake: boolean;
};

const FINAL_STATE_COLOR: Record<
  FinalExam["state"],
  "default" | "success" | "error" | "warning" | "info"
> = {
  locked: "error",
  ready: "default",
  active: "success",
  submitted: "default",
  "awaiting-grade": "warning",
  graded: "success",
  flagged: "error",
  unavailable: "default",
};

export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [final, setFinal] = useState<FinalExam | null>(null);
  const [finalWindow, setFinalWindow] = useState<FinalWindow | null>(null);
  const [finalCase, setFinalCase] = useState<FinalCase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retakeReason, setRetakeReason] = useState("");
  const [starting, setStarting] = useState(false);
  const now = useVirtualClock();

  function localizedLaunchUrl(rawUrl: string): string {
    const launchUrl = new URL(rawUrl);
    launchUrl.searchParams.set(
      "uiLocale",
      document.documentElement.lang.toLowerCase().startsWith("ar") ? "ar" : "en",
    );
    return launchUrl.toString();
  }

  /**
   * The URL this page was opened with is never consulted. A link here may
   * carry exam_id / status query parameters — crafted, or appended by an
   * external redirect — but none of them are ever read; the page does not
   * touch useSearchParams and re-renders nothing from them. Every render's
   * state comes exclusively from the authenticated, session-scoped GET
   * /api/exams below, which re-derives windows from the exam system and the
   * final's status from this app's callback-populated store. Returning to
   * this page (back navigation, tab switch, closing the exam window) runs
   * this fetch again before anything is re-rendered.
   */
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/exams", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not load exams.");
        return;
      }
      setExams(data.exams);
      setFinal(data.final ?? null);
      setFinalWindow(data.finalWindow ?? null);
      setFinalCase(data.finalCase ?? null);
      setError(null);
    } catch {
      // Offline or unreachable — the polling below retries automatically.
      setError("Could not reach the server — retrying.");
    }
  }, []);

  useEffect(() => {
    load();
    const refresh = setInterval(load, 15_000);
    return () => clearInterval(refresh);
  }, [load]);

  // Returning or resuming — tab switch, back navigation, closing the exam
  // window — re-derives the true current state immediately instead of waiting
  // for the poll above. The fetch re-runs on every visible return.
  useEffect(() => {
    const onPageshow = () => load();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("pageshow", onPageshow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageshow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  async function start(exam: Exam) {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: exam.kind, week: exam.week }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start the exam.");
      window.open(localizedLaunchUrl(data.url), "_blank", "noopener");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the exam.");
    } finally {
      setStarting(false);
    }
  }

  /**
   * Ask the Exam service to start the final. The service decides eligibility
   * and the attempt lifecycle; its denial reason is shown verbatim, and a
   * successful start is stored server-side so the next load shows "active".
   */
  async function startFinal() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "final" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start the final exam.");
      window.open(localizedLaunchUrl(data.url), "_blank", "noopener");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the final exam.");
    } finally {
      setStarting(false);
    }
  }

  async function requestRetake() {
    setStarting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/exams/retake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: retakeReason }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not request the retake.");
      setRetakeReason("");
      setNotice(data.message);
      setFinalCase(data.finalCase);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request the retake.");
    } finally {
      setStarting(false);
    }
  }

  if (!exams) return <CircularProgress />;

  /** One plain sentence about the window, measured on the virtual clock. */
  function windowLine(exam: Exam): string {
    if (!now) return "";
    const closes = new Date(exam.closesAt).getTime() - now.getTime();

    if (exam.state === "submitted") return `Submitted — score ${exam.score} / ${exam.maxScore}.`;
    if (exam.state === "missed") return `Window closed ${formatRelative(exam.closesAt, now)}.`;
    if (exam.state === "open") return `Open now — closes in ${formatCountdown(closes)}.`;
    // A quiz follows its own lecture; a midterm follows the LAST lecture of the
    // first half it covers (exam.week is the semester midpoint).
    const opensAfter =
      exam.kind === "mid"
        ? exam.week
          ? `Opens after week ${exam.week}`
          : "Opens after the last lecture it covers"
        : "Opens after the lecture";
    return `${opensAfter}, ${formatRelative(exam.opensAt, now)} (${formatDateTime(exam.opensAt)}). You get ${
      exam.kind === "mid" ? "3 days" : "24 hours"
    }.`;
  }

  const openNow = exams.filter((exam) => exam.state === "open");
  const nextLocked = [...exams]
    .filter((exam) => exam.state === "locked")
    .sort((a, b) => new Date(a.opensAt).getTime() - new Date(b.opensAt).getTime())[0];
  const finalAvailable = Boolean(finalWindow && finalWindow.phase !== "unscheduled");

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Exams</Typography>
      <Typography variant="body1" color="text.secondary">
        A quiz opens when its lecture ends and stays open for 24 hours. Each semester has
        one midterm at its midpoint, which stays open for 3
        days. The final opens after the last lecture for 24 hours; quiz scores do not gate it.
        If your connection or electricity fails, start it again to continue with saved answers—the
        older session expires. After the window, you have 14 days to request a reserve-form retake.
      </Typography>

      {openNow.length ? (
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              variant="outlined"
              disabled={starting}
              onClick={() => start(openNow[0])}
            >
              Take now
            </Button>
          }
        >
          {openNow.length === 1 ? (
            <>
              <b data-generated-content="true" lang="en" dir="ltr">
                {openNow[0].title}
              </b>{" "}
              is open — {windowLine(openNow[0]).toLowerCase()}
            </>
          ) : (
            `${openNow.length} exams are open right now — do not miss the deadlines.`
          )}
        </Alert>
      ) : nextLocked ? (
        <Alert severity="info">
          Next:{" "}
          <span data-generated-content="true" lang="en" dir="ltr">
            {nextLocked.title}
          </span>
          . {windowLine(nextLocked)}
        </Alert>
      ) : null}

      {error ? <Alert severity="error">{error}</Alert> : null}
      {notice ? <Alert severity="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <Accordion>
        <AccordionSummary
          expandIcon={<ExpandMoreRounded />}
          aria-controls="all-assessments"
          id="all-assessments-heading"
        >
          <Stack direction="row" spacing={1.5} className="align-center">
            <Typography variant="h6">All assessments</Typography>
            <Chip size="small" variant="outlined" label={exams.length + " total"} />
          </Stack>
        </AccordionSummary>
        <AccordionDetails id="all-assessments">
          <List>
          {exams.map((exam) => (
            <ListItem
              key={`${exam.kind}-${exam.week ?? "mid"}`}
              secondaryAction={
                <Grid container spacing={1}>
                  {exam.flagged ? (
                    <Grid>
                      <Chip size="small" color="error" label="integrity flag" />
                    </Grid>
                  ) : null}
                  {exam.state === "submitted" ? (
                    <Grid>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`${exam.score} / ${exam.maxScore}`}
                      />
                    </Grid>
                  ) : null}
                  <Grid>
                    <Chip
                      size="small"
                      color={STATE_COLOR[exam.state]}
                      variant={exam.state === "open" ? "filled" : "outlined"}
                      label={exam.state}
                    />
                  </Grid>
                  <Grid>
                    {exam.kind === "quiz" && exam.state === "missed" && exam.week ? (
                      <Button
                        component={Link}
                        href={`/absences?itemType=quiz&week=${exam.week}`}
                        variant="outlined"
                        color="warning"
                        size="small"
                      >
                        Appeal absence
                      </Button>
                    ) : (
                      <Button
                        variant="contained"
                        size="small"
                        disabled={exam.state !== "open" || starting}
                        onClick={() => start(exam)}
                      >
                        {exam.kind === "mid" ? "Take midterm" : "Take quiz"}
                      </Button>
                    )}
                  </Grid>
                </Grid>
              }
            >
              <ListItemText
                primary={
                  <span data-generated-content="true" lang="en" dir="ltr">
                    {exam.title}
                  </span>
                }
                secondary={windowLine(exam)}
              />
            </ListItem>
          ))}
          </List>
        </AccordionDetails>
      </Accordion>

      {finalAvailable || final !== null ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Final exam</Typography>
              {finalCase ? (
                <Stack spacing={1.5}>
                  <Typography variant="body2" color="text.secondary">
                    Primary window: {formatDateTime(finalCase.primaryOpensAt)} to {formatDateTime(finalCase.primaryClosesAt)}.
                    Retake requests close {formatDateTime(finalCase.requestDeadline)}.
                  </Typography>

                  {final ? (
                    <Grid container spacing={1}>
                      <Grid>
                        <Typography
                          variant="subtitle1"
                          data-generated-content="true"
                          lang="en"
                          dir="ltr"
                        >
                          {final.title}
                        </Typography>
                      </Grid>
                      <Grid><Chip size="small" color={FINAL_STATE_COLOR[final.state]} label={final.state} /></Grid>
                    </Grid>
                  ) : null}

                  {final?.state === "locked" ? (
                    <Alert severity="error">
                      <span data-generated-content="true" lang="en" dir="ltr">
                        {final.reason ?? "Locked."}
                      </span>
                    </Alert>
                  ) : null}
                  {final?.state === "flagged" ? (
                    <Alert severity="error">This attempt was flagged for review.</Alert>
                  ) : null}

                  {finalCase.canStartPrimary ? (
                    <Stack spacing={1}>
                      {final?.state === "active" ? (
                        <Alert severity="info">
                          Your answers are saved on the server. Continuing opens a new session and immediately expires the old session token.
                        </Alert>
                      ) : null}
                      <Button variant="contained" disabled={starting} onClick={startFinal}>
                        {final?.state === "active" ? "Continue in a new session" : "Start primary final"}
                      </Button>
                    </Stack>
                  ) : null}

                  {finalCase.provisionalResult && !finalCase.finalizedAt ? (
                    <Alert severity={finalCase.provisionalResult.passed ? "success" : "warning"}>
                      Provisional result {finalCase.provisionalResult.mark} / {finalCase.provisionalResult.maxScore}.
                      It becomes official only after the retake decision window. You may request a retake even with a perfect score.
                    </Alert>
                  ) : null}

                  {finalCase.canRequestRetake ? (
                    <Stack spacing={1}>
                      <Alert severity="info">
                        The primary window has ended. You may request one reserve-form retake before {formatDateTime(finalCase.requestDeadline)}, even if you completed the exam or earned 100%.
                      </Alert>
                      <TextField
                        label="What happened?"
                        value={retakeReason}
                        onChange={(event) => setRetakeReason(event.target.value.slice(0, 1000))}
                        helperText={`${retakeReason.length}/1000 · describe the network, electricity, health, or other issue`}
                        multiline
                        minRows={3}
                      />
                      <Button
                        variant="contained"
                        disabled={starting || retakeReason.trim().length < 20}
                        onClick={requestRetake}
                      >
                        Request final retake
                      </Button>
                    </Stack>
                  ) : null}

                  {finalCase.phase === "retake-waiting" ? (
                    <Alert severity="success">
                      A retake will be available in 7 days, at {formatDateTime(finalCase.retakeAvailableAt!)}.
                      Study hard, focus on the topics that challenged you, and keep going—you’ve got this.
                      An administrator may decline the request before the retake starts.
                    </Alert>
                  ) : null}

                  {finalCase.canStartRetake ? (
                    <Stack spacing={1}>
                      <Alert severity="warning">
                        Your reserve paper is open until {formatDateTime(finalCase.retakeClosesAt!)}. Its result replaces the primary result; if you do not take it, the primary result remains official.
                      </Alert>
                      <Button variant="contained" disabled={starting} onClick={startFinal}>
                        {final?.state === "active" ? "Continue retake in a new session" : "Start reserve-form retake"}
                      </Button>
                    </Stack>
                  ) : null}

                  {finalCase.declineReason ? (
                    <Alert severity="error">
                      Your retake request was declined.{" "}
                      <span data-generated-content="true" lang="en" dir="ltr">
                        {finalCase.declineReason}
                      </span>
                    </Alert>
                  ) : null}
                  {finalCase.phase === "awaiting-grade" || final?.state === "awaiting-grade" ? (
                    <Alert severity="warning">Submitted — awaiting grading before the official result can be set.</Alert>
                  ) : null}
                  {finalCase.phase === "finalized" ? (
                    <Stack spacing={1}>
                      <Alert severity={finalCase.officialResult?.passed ? "success" : "error"}>
                        {finalCase.officialAbsent
                          ? "Official final result: Absent — 0 (F)."
                          : finalCase.officialResult
                          ? `Official final result ${finalCase.officialResult.mark} / ${finalCase.officialResult.maxScore} — ${finalCase.officialResult.passed ? "passed" : "not passed"}.`
                          : "The official final grade has been set."}
                      </Alert>
                      <Button component={Link} href="/transcript" variant="contained">
                        Track transcript release
                      </Button>
                    </Stack>
                  ) : null}
                </Stack>
              ) : (
                <Typography variant="body1">The final exam is not scheduled yet.</Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {exams.some((exam) => exam.state === "submitted") ? (
        <Stack spacing={2}>
          <Typography variant="h5">Results</Typography>
          <Typography variant="body2" color="text.secondary">
            What the exam system sent back after each submission — the score and the
            integrity verdict. The proctoring detail behind a flag stays with the
            exam reviewers.
          </Typography>
          {exams
            .filter((exam) => exam.state === "submitted")
            .map((exam) => (
              <ReportCard key={`report-${exam.kind}-${exam.week ?? "mid"}`} exam={exam} />
            ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

/** One submitted exam: verdict (score + integrity flag) and feedback. */
function ReportCard({ exam }: { exam: Exam }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1}>
          <Grid container spacing={1}>
            <Grid>
              <Typography
                variant="subtitle1"
                data-generated-content="true"
                lang="en"
                dir="ltr"
              >
                {exam.title}
              </Typography>
            </Grid>
            <Grid>
              <Chip
                size="small"
                color={exam.flagged ? "error" : "success"}
                label={exam.flagged ? "problem — flagged" : "no problem"}
              />
            </Grid>
            <Grid>
              <Chip size="small" variant="outlined" label={`score ${exam.score} / ${exam.maxScore}`} />
            </Grid>
          </Grid>
          {exam.feedback ? (
            <Typography
              variant="body2"
              data-generated-content="true"
              lang="en"
              dir="ltr"
            >
              {exam.feedback}
            </Typography>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
