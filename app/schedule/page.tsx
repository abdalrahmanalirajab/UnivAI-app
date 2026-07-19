"use client";

import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import {
  formatCountdown,
  formatDateTime,
  formatLateness,
  formatRelative,
  useVirtualClock,
} from "@/lib/time";

type Lecture = {
  id: number;
  week: number;
  title: string;
  startsAt: string;
  joinCutoffAt: string;
  endsAt: string;
  state: "upcoming" | "live" | "done";
  joinable: boolean;
  completed: boolean;
  blockedMessage: string | null;
  slides: number;
  attendance: { status: string; joinedAt: string | null; lateMinutes: number } | null;
};

const STATE_COLOR = { live: "success", upcoming: "default", done: "default" } as const;

const ATTENDANCE_COLOR: Record<string, "success" | "warning" | "error" | "default"> = {
  on_time: "success",
  late: "warning",
  absent: "error",
  upcoming: "default",
};

/** The one line that tells you what to do about this lecture right now. */
function urgency(lecture: Lecture, now: Date | null): string {
  if (!now) return "";
  const ms = (iso: string) => new Date(iso).getTime() - now.getTime();

  if (lecture.completed) return "You finished this lecture.";
  if (lecture.state === "upcoming") return `Starts ${formatRelative(lecture.startsAt, now)}`;

  if (lecture.state === "live") {
    const toCutoff = ms(lecture.joinCutoffAt);
    if (toCutoff > 0) return `Doors close in ${formatCountdown(toCutoff)}`;
    return "The doors have closed for this lecture.";
  }

  return `Ended ${formatRelative(lecture.endsAt, now)}`;
}

export default function SchedulePage() {
  const [lectures, setLectures] = useState<Lecture[] | null>(null);
  const [selected, setSelected] = useState<Lecture | null>(null);
  const now = useVirtualClock();

  const load = useCallback(async () => {
    const res = await fetch("/api/lectures", { cache: "no-store" });
    const data = await res.json();
    setLectures(data.lectures);
  }, []);

  useEffect(() => {
    load();
    const refresh = setInterval(load, 15_000);
    return () => clearInterval(refresh);
  }, [load]);

  if (!lectures) return <CircularProgress />;

  const live = lectures.find((lecture) => lecture.state === "live" && lecture.joinable);
  const next = lectures.find((lecture) => lecture.state === "upcoming");

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Schedule</Typography>

      {live ? (
        <Alert
          severity="success"
          action={
            <Button component={Link} href={`/lecture/${live.id}`} color="inherit" variant="outlined">
              Join now
            </Button>
          }
        >
          Week {live.week} is live — {urgency(live, now).toLowerCase()}.
        </Alert>
      ) : next ? (
        <Alert severity="info">
          Next lecture: week {next.week}, {formatRelative(next.startsAt, now)} (
          {formatDateTime(next.startsAt)}).
        </Alert>
      ) : null}

      <Card variant="outlined">
        <List>
          {lectures.map((lecture) => (
            <ListItemButton key={lecture.id} onClick={() => setSelected(lecture)}>
              <ListItemText
                primary={`Week ${lecture.week} — ${lecture.title}`}
                secondary={`${formatDateTime(lecture.startsAt)} · ${urgency(lecture, now)}`}
              />
              <Grid container spacing={1}>
                {lecture.completed ? (
                  <Grid>
                    <Chip size="small" color="success" variant="outlined" label="finished" />
                  </Grid>
                ) : null}
                {lecture.attendance ? (
                  <Grid>
                    <Chip
                      size="small"
                      color={ATTENDANCE_COLOR[lecture.attendance.status] ?? "default"}
                      label={
                        lecture.attendance.status === "late"
                          ? formatLateness(lecture.attendance.lateMinutes)
                          : lecture.attendance.status.replace("_", " ")
                      }
                    />
                  </Grid>
                ) : null}
                <Grid>
                  <Chip
                    size="small"
                    color={STATE_COLOR[lecture.state]}
                    variant={lecture.state === "live" ? "filled" : "outlined"}
                    label={lecture.state}
                  />
                </Grid>
              </Grid>
            </ListItemButton>
          ))}
        </List>
      </Card>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm">
        <DialogTitle>{selected ? `Week ${selected.week} — ${selected.title}` : ""}</DialogTitle>
        <DialogContent dividers>
          {selected ? (
            <Stack spacing={2}>
              <Stack spacing={1}>
                <Typography variant="overline" color="text.secondary">
                  When
                </Typography>
                <Typography variant="body1">{formatDateTime(selected.startsAt)}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {urgency(selected, now)}
                </Typography>
              </Stack>

              <Divider />

              <Grid container spacing={1}>
                <Grid>
                  <Chip
                    color={STATE_COLOR[selected.state]}
                    variant={selected.state === "live" ? "filled" : "outlined"}
                    label={selected.state}
                  />
                </Grid>
                <Grid>
                  <Chip variant="outlined" label={`${selected.slides} slides`} />
                </Grid>
                <Grid>
                  <Chip
                    variant="outlined"
                    label={`doors close ${formatDateTime(selected.joinCutoffAt)}`}
                  />
                </Grid>
              </Grid>

              {selected.blockedMessage ? (
                <Alert severity={selected.completed ? "success" : "warning"}>
                  {selected.blockedMessage}
                </Alert>
              ) : null}

              <Divider />

              <Stack spacing={1}>
                <Typography variant="overline" color="text.secondary">
                  Your attendance
                </Typography>
                {selected.attendance?.joinedAt ? (
                  <Typography variant="body1">
                    {selected.attendance.status === "late"
                      ? `You joined ${formatLateness(selected.attendance.lateMinutes)}, at ${formatDateTime(selected.attendance.joinedAt)}.`
                      : `You joined on time, at ${formatDateTime(selected.attendance.joinedAt)}.`}
                  </Typography>
                ) : selected.state === "done" ? (
                  <Typography variant="body1">You never joined this lecture.</Typography>
                ) : (
                  <Typography variant="body1" color="text.secondary">
                    Nothing recorded yet.
                  </Typography>
                )}
              </Stack>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Close</Button>
          {selected ? (
            <Button
              variant="contained"
              component={Link}
              href={`/lecture/${selected.id}`}
              disabled={!selected.joinable}
            >
              {selected.completed ? "Finished" : selected.joinable ? "Join lecture" : "Closed"}
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
