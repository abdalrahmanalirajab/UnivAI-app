"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
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
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import Link from "next/link";
import {
  formatCountdown,
  formatDateTime,
  formatLateness,
  formatRelative,
  useVirtualClock,
} from "@/lib/time";

type Lecture = {
  /** Set by the server; lectures whose payload predates session_type are still lectures. */
  session_type?: "lecture";
  id: string;
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

/** The weekly practical session scheduled immediately after theory. */
type Section = {
  session_type: "section";
  id: string;
  week: number;
  kind: string;
  title: string;
  /** Immediately after its lecture ends. */
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
};

type ScheduleRecord = Lecture | Section;

function isSection(record: ScheduleRecord): record is Section {
  return record.session_type === "section";
}

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
  const [records, setRecords] = useState<ScheduleRecord[] | null>(null);
  const [selected, setSelected] = useState<Lecture | null>(null);
  const [stale, setStale] = useState<{ from: number; to: number } | null>(null);
  const [generation, setGeneration] = useState<{ status: string; error: string | null } | null>(
    null
  );
  const [rejected, setRejected] = useState<{ status: number; error: string } | null>(null);
  const [offline, setOffline] = useState(false);
  const planVersionRef = useRef<number | null>(null);
  const now = useVirtualClock();

  const load = useCallback(async () => {
    let res: Response;
    try {
      res = await fetch("/api/lectures", { cache: "no-store" });
    } catch {
      setOffline(true);
      return;
    }
    setOffline(false);
    let data: {
      error?: string;
      planVersion?: number | null;
      generation?: { status: string; error: string | null } | null;
      lectures?: ScheduleRecord[];
    };
    try {
      data = await res.json();
    } catch {
      setRejected({
        status: res.status,
        error: "The schedule service returned an invalid response. Please retry.",
      });
      return;
    }
    if (!res.ok) {
      setRejected({ status: res.status, error: data.error ?? `Request failed (${res.status}).` });
      return;
    }
    if (!Array.isArray(data.lectures)) {
      setRejected({ status: 500, error: "The schedule response is missing its session records." });
      return;
    }
    setRejected(null);
    const version: number | null = data.planVersion ?? null;
    const viewed = planVersionRef.current;
    if (viewed !== null && version !== null && version !== viewed) {
      setStale({ from: viewed, to: version });
    }
    planVersionRef.current = version;
    setGeneration(data.generation ?? null);
    setRecords(data.lectures);
  }, []);

  useEffect(() => {
    load();
    const refresh = setInterval(load, 15_000);
    return () => clearInterval(refresh);
  }, [load]);

  if (offline) {
    return (
      <Stack spacing={3}>
        <Typography variant="h4">Schedule</Typography>
        <Alert
          severity="warning"
          action={
            <Button variant="outlined" color="inherit" onClick={load}>
              Retry
            </Button>
          }
        >
          <AlertTitle>No connection</AlertTitle>
          You appear to be offline. The schedule will load automatically once the connection
          returns.
        </Alert>
      </Stack>
    );
  }

  if (rejected) {
    const unauthorized = rejected.status === 401;
    return (
      <Stack spacing={3}>
        <Typography variant="h4">Schedule</Typography>
        <Alert
          severity="error"
          action={
            unauthorized ? (
              <Button component={Link} href="/login" color="inherit" variant="outlined">
                Sign in
              </Button>
            ) : null
          }
        >
          <AlertTitle>{unauthorized ? "Unauthorized" : "Schedule unavailable"}</AlertTitle>
          {rejected.error}
        </Alert>
      </Stack>
    );
  }

  if (!records) return <CircularProgress />;

  if (records.length === 0) {
    return (
      <Stack spacing={3}>
        <Typography variant="h4">Schedule</Typography>
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1}>
              <Typography variant="h6">No schedule yet</Typography>
              <Typography variant="body2" color="text.secondary">
                Your schedule stays empty until your programme is approved — lectures will appear
                here once they are scheduled from the approved plan.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    );
  }

  const lectures = records.filter((record): record is Lecture => !isSection(record));
  const live = lectures.find((lecture) => lecture.state === "live" && lecture.joinable);
  const next = lectures.find((lecture) => lecture.state === "upcoming");

  const materialsReady = lectures.filter((lecture) => lecture.slides > 0).length;
  const partial = materialsReady > 0 && materialsReady < lectures.length;
  const failed = generation?.status === "failed";

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

      {failed ? (
        <Alert
          severity="error"
          action={
            <Button component={Link} href="/upload" color="inherit" variant="outlined">
              Upload again
            </Button>
          }
        >
          <AlertTitle>Course generation failed</AlertTitle>
          {generation.error ?? "Unknown error."}
        </Alert>
      ) : partial ? (
        <Alert severity="info">
          Generated materials are ready for {materialsReady} of {lectures.length} weeks.
        </Alert>
      ) : null}

      {stale ? (
        <Alert severity="warning" onClose={() => setStale(null)}>
          A newer plan version is live — this schedule was updated from plan version {stale.from}{" "}
          to {stale.to}.
        </Alert>
      ) : null}

      <Accordion>
        <AccordionSummary
          expandIcon={<ExpandMoreRounded />}
          aria-controls="full-course-timeline"
          id="course-timeline-heading"
        >
          <Stack direction="row" spacing={1.5} className="align-center">
            <Typography variant="h6">Full course timeline</Typography>
            <Chip size="small" variant="outlined" label={lectures.length + " weeks"} />
          </Stack>
        </AccordionSummary>
        <AccordionDetails id="full-course-timeline">
          <Typography variant="body2" color="text.secondary">
            Open a week for its time, attendance, materials, and join status.
          </Typography>
          <List>
          {lectures.map((lecture) => (
            <Fragment key={lecture.id}>
              <ListItemButton onClick={() => setSelected(lecture)}>
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
              {records
                .filter(
                  (record): record is Section =>
                    isSection(record) && record.week === lecture.week
                )
                .map((section) => (
                  <ListItemButton key={section.id} component={Link} href={`/section/${section.id}`}>
                    <ListItemText
                      primary={`Section — ${section.title}`}
                      secondary={`${formatDateTime(section.startsAt)} · ${section.durationMinutes} min · immediately after this lecture`}
                    />
                    <Grid container spacing={1}>
                      <Grid>
                        <Chip size="small" color="secondary" variant="outlined" label="section" />
                      </Grid>
                      <Grid>
                        <Chip size="small" variant="outlined" label={section.kind} />
                      </Grid>
                    </Grid>
                  </ListItemButton>
                ))}
            </Fragment>
          ))}
          </List>
        </AccordionDetails>
      </Accordion>

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
