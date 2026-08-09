"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
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
import Typography from "@mui/material/Typography";
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
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const now = useVirtualClock();

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
      window.open(data.url, "_blank", "noopener");
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
      window.open(data.url, "_blank", "noopener");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the final exam.");
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
  const quizOpenTimes = exams
    .filter((exam) => exam.kind === "quiz")
    .map((exam) => new Date(exam.opensAt).getTime());
  const finalAvailable = Boolean(
    now && quizOpenTimes.length > 0 && now.getTime() >= Math.max(...quizOpenTimes),
  );

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Exams</Typography>
      <Typography variant="body1" color="text.secondary">
        A quiz opens when its lecture ends and stays open for 24 hours. Each semester has
        one midterm at its midpoint, which stays open for 3
        days. The final appears after the last lecture ends; quiz scores do not gate it.
        Exams run in the exam system and your results come back to the dashboard.
      </Typography>

      {openNow.length ? (
        <Alert severity="warning">
          {openNow.length === 1
            ? `${openNow[0].title} is open — ${windowLine(openNow[0]).toLowerCase()}`
            : `${openNow.length} exams are open right now — do not miss the deadlines.`}
        </Alert>
      ) : null}

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Card variant="outlined">
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
                    <Button
                      variant="contained"
                      size="small"
                      disabled={exam.state !== "open" || starting}
                      onClick={() => start(exam)}
                    >
                      {exam.kind === "mid" ? "Take midterm" : "Take quiz"}
                    </Button>
                  </Grid>
                </Grid>
              }
            >
              <ListItemText primary={exam.title} secondary={windowLine(exam)} />
            </ListItem>
          ))}
        </List>
      </Card>

      {finalAvailable || final !== null ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Final exam</Typography>
              {final === null ? (
                <Button variant="contained" size="small" disabled={starting} onClick={startFinal}>
                  Start final exam
                </Button>
              ) : (
              <Stack spacing={1}>
                <Grid container spacing={1}>
                  <Grid>
                    <Typography variant="subtitle1">{final.title}</Typography>
                  </Grid>
                  <Grid>
                    <Chip size="small" color={FINAL_STATE_COLOR[final.state]} label={final.state} />
                  </Grid>
                </Grid>
                {final.state === "locked" ? (
                  <Alert severity="error">{final.reason ?? "Locked."}</Alert>
                ) : null}
                {final.state === "ready" ? (
                  <Button variant="contained" size="small" disabled={starting} onClick={startFinal}>
                    Start final exam
                  </Button>
                ) : null}
                {final.state === "active" ? (
                  <Typography variant="body1">
                    Already in progress — continue in the exam window. It cannot be started twice.
                  </Typography>
                ) : null}
                {final.state === "submitted" ? (
                  <Typography variant="body1">Submitted — your result is not final yet.</Typography>
                ) : null}
                {final.state === "awaiting-grade" ? (
                  <Alert severity="warning">
                    Submitted — awaiting grade from the exam system.
                  </Alert>
                ) : null}
                {final.state === "graded" ? (
                  <Stack spacing={1}>
                    <Alert severity={final.result?.passed ? "success" : "error"}>
                      {final.result
                        ? `Result ${final.result.mark} / ${final.result.max_score} — ${
                            final.result.passed ? "passed" : "not passed"
                          }.`
                        : "Graded."}
                    </Alert>
                    <Button component={Link} href="/transcript" variant="contained">
                      View final course grade and GPA
                    </Button>
                  </Stack>
                ) : null}
                {final.state === "flagged" ? (
                  <Alert severity="error">This attempt was flagged for review.</Alert>
                ) : null}
                {final.state === "unavailable" ? (
                  <Typography variant="body1">No final is currently available.</Typography>
                ) : null}
              </Stack>
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
              <Typography variant="subtitle1">{exam.title}</Typography>
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
          {exam.feedback ? <Typography variant="body2">{exam.feedback}</Typography> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
