"use client";

import { useCallback, useEffect, useState } from "react";
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

type Attendance = {
  lectureId: number;
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
  const now = useVirtualClock();

  const load = useCallback(async () => {
    const res = await fetch("/api/dashboard", { cache: "no-store" });
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <CircularProgress />;

  const { summary } = data;

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Your dashboard</Typography>

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
