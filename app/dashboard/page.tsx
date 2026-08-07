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
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { formatCountdown, formatDateTime, formatLateness, formatRelative, useVirtualClock } from "@/lib/time";
import { FINAL_STATE_COLOR, FINAL_STATE_SUMMARY } from "@/lib/exam-status-view";
import type { ExamServiceStatusV1 } from "@/lib/exams";

type Attendance = {
  lectureId: string;
  week: number;
  title: string;
  startsAt: string;
  status: "on_time" | "late" | "absent" | "upcoming";
  joinedAt: string | null;
  lateMinutes: number;
};

type Data = {
  attendance: Attendance[];
  summary: {
    onTimeCount: number;
    lateCount: number;
    absentCount: number;
    upcomingCount: number;
    totalLateMinutes: number;
    averageLateMinutes: number;
  };
  grades: Array<{
    id: number;
    kind: string;
    week: number | null;
    score: string;
    max_score: string;
    feedback: string | null;
    flagged: boolean;
  }>;
  /** The same Phase 1 contract the exams page renders — summary status here. */
  final: ExamServiceStatusV1 | null;
};

const STATUS_COLOR: Record<Attendance["status"], "success" | "warning" | "error" | "default"> = {
  on_time: "success",
  late: "warning",
  absent: "error",
  upcoming: "default",
};

const STATUS_LABEL: Record<Attendance["status"], string> = {
  on_time: "on time",
  late: "late",
  absent: "absent",
  upcoming: "upcoming",
};

export default function DashboardPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useVirtualClock();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Could not load the dashboard.");
        return;
      }
      setData(body);
      setError(null);
    } catch {
      // Offline or unreachable — previously loaded data stays visible (stale)
      // and the retry button / next load recovers.
      setError("Could not reach the server — retrying.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <CircularProgress />;

  const { summary, final } = data;

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Your dashboard</Typography>

      {error ? (
        <Alert
          severity="error"
          action={
            <Button size="small" onClick={load}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Final exam</Typography>
            {final === null ? (
              <Typography variant="body2" color="text.secondary">
                No final exam information yet — the exam system decides availability.
              </Typography>
            ) : (
              <Grid container spacing={1}>
                <Grid>
                  <Chip
                    size="small"
                    color={FINAL_STATE_COLOR[final.state]}
                    label={FINAL_STATE_SUMMARY[final.state]}
                  />
                </Grid>
                <Grid>
                  {final.state === "graded" && final.result ? (
                    <Typography variant="body2">
                      Result {final.result.mark} / {final.result.max_score} —{" "}
                      {final.result.passed ? "passed" : "not passed"}.
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Summary status — see the exams page for full detail.
                    </Typography>
                  )}
                </Grid>
              </Grid>
            )}
            <Button component={Link} href="/exams" variant="outlined" size="small">
              Open exams page
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Attendance</Typography>
            <Grid container spacing={1}>
              <Grid>
                <Chip color="success" label={`on time: ${summary.onTimeCount}`} />
              </Grid>
              <Grid>
                <Chip color="warning" label={`late: ${summary.lateCount}`} />
              </Grid>
              <Grid>
                <Chip color="error" label={`absent: ${summary.absentCount}`} />
              </Grid>
              <Grid>
                <Chip variant="outlined" label={`upcoming: ${summary.upcomingCount}`} />
              </Grid>
              <Grid>
                <Chip
                  variant="outlined"
                  label={`total lateness: ${summary.totalLateMinutes ? formatCountdown(summary.totalLateMinutes * 60_000) : "none"}`}
                />
              </Grid>
              <Grid>
                <Chip
                  variant="outlined"
                  label={`average lateness: ${summary.averageLateMinutes ? formatCountdown(summary.averageLateMinutes * 60_000) : "none"}`}
                />
              </Grid>
            </Grid>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Week</TableCell>
                  <TableCell>Lecture</TableCell>
                  <TableCell>Starts at</TableCell>
                  <TableCell>You joined</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Lateness</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.attendance.map((record) => (
                  <TableRow key={record.lectureId}>
                    <TableCell>{record.week}</TableCell>
                    <TableCell>{record.title}</TableCell>
                    <TableCell>
                      {formatDateTime(record.startsAt)}
                      <Typography variant="caption" color="text.secondary" component="div">
                        {formatRelative(record.startsAt, now)}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDateTime(record.joinedAt)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={STATUS_COLOR[record.status]}
                        label={STATUS_LABEL[record.status]}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {record.lateMinutes ? formatLateness(record.lateMinutes) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Grades</Typography>
            {data.grades.length ? (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Assessment</TableCell>
                    <TableCell>Week</TableCell>
                    <TableCell align="right">Score</TableCell>
                    <TableCell>Feedback</TableCell>
                    <TableCell>Integrity</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.grades.map((grade) => (
                    <TableRow key={grade.id}>
                      <TableCell>{grade.kind === "midterm" ? "Midterm" : "Quiz"}</TableCell>
                      <TableCell>{grade.week ?? "—"}</TableCell>
                      <TableCell align="right">{`${grade.score} / ${grade.max_score}`}</TableCell>
                      <TableCell>{grade.feedback ?? "—"}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={grade.flagged ? "error" : "success"}
                          variant="outlined"
                          label={grade.flagged ? "flagged" : "clean"}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Typography color="text.secondary">
                No grades yet. Quizzes and the midterm come from the exam system.
              </Typography>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
