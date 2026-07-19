"use client";

import { useCallback, useEffect, useState } from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { formatCountdown, formatDateTime, formatRelative, useVirtualClock } from "@/lib/time";

type Report = {
  suspicion_score?: number;
  flagged?: boolean;
  session_status?: string;
  events?: { type: string; weight: number; occurrences: number; at: string }[];
};

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

export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const now = useVirtualClock();

  const load = useCallback(async () => {
    const res = await fetch("/api/exams", { cache: "no-store" });
    const data = await res.json();
    setExams(data.exams);
  }, []);

  useEffect(() => {
    load();
    const refresh = setInterval(load, 15_000);
    return () => clearInterval(refresh);
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

  if (!exams) return <CircularProgress />;

  /** One plain sentence about the window, measured on the virtual clock. */
  function windowLine(exam: Exam): string {
    if (!now) return "";
    const opens = new Date(exam.opensAt).getTime() - now.getTime();
    const closes = new Date(exam.closesAt).getTime() - now.getTime();

    if (exam.state === "submitted") return `Submitted — score ${exam.score} / ${exam.maxScore}.`;
    if (exam.state === "missed") return `Window closed ${formatRelative(exam.closesAt, now)}.`;
    if (exam.state === "open") return `Open now — closes in ${formatCountdown(closes)}.`;
    return `Opens after the lecture, ${formatRelative(exam.opensAt, now)} (${formatDateTime(exam.opensAt)}). You get ${
      exam.kind === "mid" ? "3 days" : "24 hours"
    }.`;
  }

  const openNow = exams.filter((exam) => exam.state === "open");

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Exams</Typography>
      <Typography variant="body1" color="text.secondary">
        A quiz opens when its lecture ends and stays open for 24 hours. The midterm opens
        after week 4 and stays open for 3 days. Exams run in the exam system and your
        results come back to the dashboard.
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

      {exams.some((exam) => exam.state === "submitted") ? (
        <Stack spacing={2}>
          <Typography variant="h5">Results and proctoring reports</Typography>
          <Typography variant="body2" color="text.secondary">
            What the exam system sent back after each submission — including the
            integrity report. Admin view for now.
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

/** One submitted exam: verdict, score, and the cheating report behind an accordion. */
function ReportCard({ exam }: { exam: Exam }) {
  const report = exam.report;
  const events = report?.events ?? [];

  return (
    <Card variant="outlined">
      <Accordion disableGutters>
        <AccordionSummary>
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
            {typeof report?.suspicion_score === "number" ? (
              <Grid>
                <Chip
                  size="small"
                  variant="outlined"
                  color={report.suspicion_score > 0 ? "warning" : "default"}
                  label={`suspicion ${report.suspicion_score}`}
                />
              </Grid>
            ) : null}
          </Grid>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            {exam.feedback ? (
              <Typography variant="body2">{exam.feedback}</Typography>
            ) : null}
            {events.length ? (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Event</TableCell>
                    <TableCell align="right">Times</TableCell>
                    <TableCell align="right">Weight</TableCell>
                    <TableCell>Last seen</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {events.map((event, index) => (
                    <TableRow key={`${event.type}-${index}`}>
                      <TableCell>{event.type.replace(/_/g, " ")}</TableCell>
                      <TableCell align="right">{event.occurrences}</TableCell>
                      <TableCell align="right">{event.weight}</TableCell>
                      <TableCell>{event.at ? formatDateTime(event.at) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No proctoring events — a clean sitting.
              </Typography>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Card>
  );
}
