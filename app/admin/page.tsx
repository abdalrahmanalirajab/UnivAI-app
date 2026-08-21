"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Avatar from "@mui/material/Avatar";
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
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TablePagination from "@mui/material/TablePagination";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AutoStoriesOutlined from "@mui/icons-material/AutoStoriesOutlined";
import BuildOutlined from "@mui/icons-material/BuildOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import ManageAccountsOutlined from "@mui/icons-material/ManageAccountsOutlined";
import QueryStatsOutlined from "@mui/icons-material/QueryStatsOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import { formatCountdown, formatDateTime, formatLateness } from "@/lib/time";
import RateLimitManager from "./RateLimitManager";
import TranscriptReviewManager from "./TranscriptReviewManager";
import FinalRetakeReviewManager from "./FinalRetakeReviewManager";
import AdminNotificationMonitor from "./AdminNotificationMonitor";
import AdminFeedbackReports from "./AdminFeedbackReports";
import AdminActionInbox from "./AdminActionInbox";

type Student = { sid: string; name: string; email: string; role: string };
type Book = {
  id: number;
  filename: string;
  title: string | null;
  pages: number;
  status: string;
  error: string | null;
  progress: string | null;
};
type Lecture = {
  id: string;
  week: number;
  title: string;
  starts_at: string;
  status: string;
};
type Attendance = {
  lectureId: string;
  week: number;
  title: string;
  startsAt: string;
  status: string;
  joinedAt: string | null;
  lateMinutes: number;
  completedAt: string | null;
  attendanceStatus: "attended" | "partially_attended" | "absent" | "upcoming";
  attendancePercentage: number;
  attendedLectureMinutes: number;
  connectedSeconds: number;
  isConnected: boolean;
  inProgress: boolean;
  disconnectCount: number;
  lastDisconnectedAt: string | null;
};
type Grade = {
  id: number;
  kind: string;
  week: number | null;
  score: string;
  max_score: string;
  feedback: string | null;
  flagged?: boolean;
  report?: {
    suspicion_score?: number;
    raw_score?: number | null;
    integrity_penalty_applied?: boolean;
    risk_band?: string;
    events?: unknown[];
    integrity_events?: Array<{
      type: string;
      at: string;
      evidence_value?: number;
      details?: Record<string, unknown>;
    }>;
  } | null;
};
type QaEntry = {
  id: number;
  question: string;
  answer: string;
  model_used: string | null;
  asked_at: string;
};
type AuditEntry = {
  id: number;
  action: string;
  actor_email: string | null;
  target_id: string | null;
  detail: unknown;
  created_at: string;
};
type AttendanceSummary = {
  onTimeCount: number;
  lateCount: number;
  absentCount: number;
  upcomingCount: number;
  totalLateMinutes: number;
  averageLateMinutes: number;
  attendedCount: number;
  partiallyAttendedCount: number;
  participationAbsentCount: number;
  inProgressCount: number;
  connectedCount: number;
  averageAttendancePercentage: number;
};
type AdminState = {
  clock: { now: string; offsetMs: number };
  learner?: Student;
  sid?: string;
  books: Book[];
  lectures: Lecture[];
  attendance: Attendance[];
  attendanceSummary: AttendanceSummary;
  grades: Grade[];
  qaLog: QaEntry[];
};

const EMPTY_SUMMARY: AttendanceSummary = {
  onTimeCount: 0,
  lateCount: 0,
  absentCount: 0,
  upcomingCount: 0,
  totalLateMinutes: 0,
  averageLateMinutes: 0,
  attendedCount: 0,
  partiallyAttendedCount: 0,
  participationAbsentCount: 0,
  inProgressCount: 0,
  connectedCount: 0,
  averageAttendancePercentage: 0,
};

type ConfirmAction = "regenerate" | "restart" | null;

const ADMIN_TAB_PATHS = [
  "/admin",
  "/admin/course",
  "/admin/records",
  "/admin/virtual-clock",
  "/admin/system",
] as const;

function registrationNumberFromUrl(value: string | null): string {
  const registrationNumber = value?.trim() ?? "";
  return /^S-\d{4}-\d{6}$/.test(registrationNumber) ? registrationNumber : "";
}

function adminTabFromPath(pathname: string): number {
  const tab = ADMIN_TAB_PATHS.indexOf(pathname as (typeof ADMIN_TAB_PATHS)[number]);
  return tab < 0 ? 0 : tab;
}

function adminUrl(tab: number, registrationNumber: string): string {
  const pathname = ADMIN_TAB_PATHS[tab] ?? ADMIN_TAB_PATHS[0];
  if (!registrationNumber) return pathname;
  return `${pathname}?${new URLSearchParams({ reg_num: registrationNumber })}`;
}

function detailText(detail: unknown): string {
  if (detail === null || detail === undefined) return "—";
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return "Unreadable detail";
  }
}

export default function AdminPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlRegistrationNumber = registrationNumberFromUrl(searchParams.get("reg_num"));
  const selectedSid = urlRegistrationNumber;
  const tab = adminTabFromPath(pathname);
  const [state, setState] = useState<AdminState | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditPage, setAuditPage] = useState(0);
  const [auditPageSize, setAuditPageSize] = useState(25);
  const [auditTotal, setAuditTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isoInput, setIsoInput] = useState("");
  const [learnerOptions, setLearnerOptions] = useState<Student[]>([]);
  const [learnerQuery, setLearnerQuery] = useState("");
  const [learnerLoading, setLearnerLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const loadSequence = useRef(0);
  const displayedLearnerSid = useRef("");

  useEffect(() => {
    if (!selectedSid) {
      displayedLearnerSid.current = "";
      setLearnerQuery("");
      return;
    }
    if (state?.learner?.sid !== selectedSid || displayedLearnerSid.current === selectedSid) return;
    displayedLearnerSid.current = selectedSid;
    setLearnerQuery(state.learner.name);
  }, [selectedSid, state?.learner]);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const url = selectedSid
        ? "/api/admin/state?sid=" + encodeURIComponent(selectedSid)
        : "/api/admin/state";
      const response = await fetch(url, { cache: "no-store" });
      const raw = await response.json().catch(() => null);
      if (!response.ok) throw new Error(raw?.error ?? "Could not load administration state.");
      if (sequence !== loadSequence.current) return;
      setState({
        clock: raw.clock,
        learner: raw.learner,
        sid: raw.sid,
        books: raw.books ?? [],
        lectures: raw.lectures ?? [],
        attendance: raw.attendance ?? [],
        attendanceSummary: raw.attendanceSummary ?? EMPTY_SUMMARY,
        grades: raw.grades ?? [],
        qaLog: raw.qaLog ?? [],
      });
      setError(null);
    } catch (reason) {
      if (sequence !== loadSequence.current) return;
      setError(reason instanceof Error ? reason.message : "Could not load administration state.");
    }
  }, [selectedSid]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLearnerLoading(true);
      try {
        const params = new URLSearchParams({ page: "1", pageSize: "25" });
        if (learnerQuery.trim()) params.set("q", learnerQuery.trim());
        const response = await fetch(`/api/admin/learners?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? "Could not search learners.");
        setLearnerOptions(body.learners ?? []);
      } catch (reason) {
        if ((reason as { name?: string })?.name !== "AbortError") {
          setError(reason instanceof Error ? reason.message : "Could not search learners.");
        }
      } finally {
        if (!controller.signal.aborted) setLearnerLoading(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [learnerQuery]);

  const loadAudit = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/audit?page=${auditPage + 1}&pageSize=${auditPageSize}`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not load the audit trail.");
      setAudit(body.audit ?? []);
      setAuditTotal(Number(body.pagination?.total ?? 0));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the audit trail.");
    }
  }, [auditPage, auditPageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const building = state?.books.some(
    (book) => book.status === "generating" || book.status === "ingesting",
  ) ?? false;

  useEffect(() => {
    const watchingAttendance = Boolean(selectedSid) && (tab === 0 || tab === 2);
    if (!building && !watchingAttendance) return;
    const poll = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(poll);
  }, [building, load, selectedSid, tab]);

  const selectedStudent =
    state?.learner ?? learnerOptions.find((student) => student.sid === selectedSid);
  const latestBook = state?.books[0] ?? null;
  const flaggedCount = state?.grades.filter((grade) => grade.flagged).length ?? 0;
  const summary = { ...EMPTY_SUMMARY, ...(state?.attendanceSummary ?? {}) };
  const recordedAttendance =
    summary.attendedCount + summary.partiallyAttendedCount + summary.participationAbsentCount;
  const attendanceRate = summary.averageAttendancePercentage;
  const nextLecture = (() => {
    if (!state?.clock.now) return null;
    const nowMs = new Date(state.clock.now).getTime();
    return [...state.lectures]
      .filter((lecture) => new Date(lecture.starts_at).getTime() >= nowMs)
      .sort(
        (left, right) =>
          new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime(),
      )[0] ?? null;
  })();
  const firstLectureStart = state?.lectures.length
    ? Math.min(...state.lectures.map((lecture) => new Date(lecture.starts_at).getTime()))
    : null;
  const semesterStarted =
    firstLectureStart !== null &&
    Boolean(state?.clock.now) &&
    new Date(state?.clock.now ?? 0).getTime() >= firstLectureStart;

  async function regenerate() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full", sid: selectedSid }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Course rebuild could not start.");
      setNotice("Course rebuild started.");
      setError(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Course rebuild could not start.");
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  async function restartSemester() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid: selectedSid }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Semester restart failed.");
      setNotice(
        "Semester restarted. Progress and attempts were cleared; week 1 starts tomorrow at 10:00 virtual time.",
      );
      setError(null);
      await Promise.all([load(), loadAudit()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Semester restart failed.");
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  async function control(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch("/api/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Clock control failed.");
      setError(null);
      await Promise.all([load(), loadAudit()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Clock control failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!state && !error) {
    return (
      <Stack className="admin-loading" spacing={1.5}>
        <CircularProgress size={32} />
        <Typography color="text.secondary">Loading university operations…</Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={3.5}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        className="admin-page-header"
      >
        <Stack spacing={0.5}>
          <Typography variant="overline" color="primary">
            Restricted operations
          </Typography>
          <Typography variant="h3" component="h1">
            University control room
          </Typography>
          <Typography color="text.secondary">
            Inspect one learner at a time. Global controls have dedicated administration areas.
          </Typography>
        </Stack>
        <Button
          component={Link}
          href="/admin/users"
          variant="outlined"
          startIcon={<ManageAccountsOutlined />}
          className="admin-users-button"
        >
          Manage users
        </Button>
      </Stack>

      {error ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => void load()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert severity="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      ) : null}

      <AdminActionInbox />

      <Card className="admin-command-card">
        <CardContent>
          <Grid container spacing={2.5} className="align-center">
            <Grid size={{ xs: 12, md: 7 }}>
              <Autocomplete
                fullWidth
                options={learnerOptions}
                loading={learnerLoading}
                filterOptions={(options) => options}
                value={selectedStudent ?? null}
                inputValue={learnerQuery}
                isOptionEqualToValue={(option, value) => option.sid === value.sid}
                getOptionLabel={(option) => `${option.name} · ${option.sid} · ${option.email}`}
                onInputChange={(_event, value, reason) => {
                  if (reason === "input" || reason === "clear") setLearnerQuery(value);
                }}
                onChange={(_event, student) => {
                  const nextSid = student?.sid ?? "";
                  setLearnerQuery(student?.name ?? "");
                  displayedLearnerSid.current = nextSid;
                  router.replace(adminUrl(tab, nextSid), { scroll: false });
                  setState((current) =>
                    current
                      ? {
                          ...current,
                          learner: student ?? undefined,
                          sid: undefined,
                          books: [],
                          lectures: [],
                          attendance: [],
                          attendanceSummary: EMPTY_SUMMARY,
                          grades: [],
                          qaLog: [],
                        }
                      : current,
                  );
                }}
                noOptionsText={learnerQuery ? "No matching learner" : "No learners found"}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Learner workspace"
                    placeholder="Search name, email, or registration number"
                    helperText="Server-bounded results; type to find any learner."
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <Stack spacing={0.5} className="admin-clock-summary">
                <Typography variant="overline" color="text.secondary">
                  Shared virtual time
                </Typography>
                <Typography variant="h6">{formatDateTime(state?.clock.now)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {state?.clock.offsetMs
                    ? formatCountdown(Math.abs(state.clock.offsetMs)) +
                      (state.clock.offsetMs > 0 ? " ahead of real time" : " behind real time")
                    : "Aligned with real time"}
                </Typography>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Paper className="admin-tabs-shell" elevation={0}>
        <Tabs
          value={tab}
          onChange={(_event, value: number) => {
            router.push(adminUrl(value, selectedSid), { scroll: false });
          }}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Administration areas"
        >
          <Tab label="Overview" />
          <Tab label="Course" disabled={!selectedSid} />
          <Tab label="Records" disabled={!selectedSid} />
          <Tab label="Virtual clock" />
          <Tab label="System" />
        </Tabs>
      </Paper>

      {tab === 0 ? (
        <Stack spacing={3}>
          {!selectedSid ? (
            <Card className="admin-empty-state">
              <CardContent>
                <Stack spacing={2} className="align-center text-center">
                  <Avatar variant="rounded" className="admin-empty-icon">
                    <ManageAccountsOutlined />
                  </Avatar>
                  <Typography variant="h5">Select a learner to begin</Typography>
                  <Typography color="text.secondary">
                    Course content, attendance, grades, and Q&amp;A stay scoped to the
                    selected registration number.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          ) : (
            <>
              <Grid container spacing={2}>
                <AdminMetric
                  icon={<AutoStoriesOutlined />}
                  label="Course source"
                  value={latestBook?.status ?? "No source"}
                  detail={latestBook?.title ?? latestBook?.filename ?? "Nothing uploaded"}
                  tone={latestBook?.status === "ready" ? "success" : "default"}
                />
                <AdminMetric
                  icon={<EventAvailableOutlined />}
                  label="Attendance coverage"
                  value={recordedAttendance ? attendanceRate + "%" : "No records"}
                  detail={
                    summary.attendedCount +
                    " attended · " +
                    summary.partiallyAttendedCount +
                    " partial · " +
                    summary.participationAbsentCount +
                    " absent"
                  }
                  tone={summary.participationAbsentCount ? "warning" : "success"}
                />
                <AdminMetric
                  icon={<FactCheckOutlined />}
                  label="Assessment records"
                  value={String(state?.grades.length ?? 0)}
                  detail={flaggedCount ? flaggedCount + " integrity flag(s)" : "No integrity flags"}
                  tone={flaggedCount ? "error" : "success"}
                />
                <AdminMetric
                  icon={<ScheduleOutlined />}
                  label="Next lecture"
                  value={nextLecture ? "Week " + nextLecture.week : "None"}
                  detail={
                    nextLecture
                      ? formatDateTime(nextLecture.starts_at)
                      : "No upcoming lecture in this schedule"
                  }
                  tone="default"
                />
              </Grid>

              <Card>
                <CardContent>
                  <Grid container spacing={3}>
                    <Grid size={{ xs: 12, md: 7 }}>
                      <Stack spacing={1}>
                        <Typography variant="overline" color="text.secondary">
                          Selected learner
                        </Typography>
                        <Typography variant="h5">{selectedStudent?.name}</Typography>
                        <Typography>{selectedStudent?.email}</Typography>
                        <Stack direction="row" spacing={1}>
                          <Chip label={selectedStudent?.sid} variant="outlined" />
                          <Chip label={selectedStudent?.role} variant="outlined" />
                        </Stack>
                      </Stack>
                    </Grid>
                    <Grid size={{ xs: 12, md: 5 }}>
                      <Stack spacing={1.25}>
                        <Typography variant="overline" color="text.secondary">
                          Operational status
                        </Typography>
                        {building ? (
                          <>
                            <LinearProgress />
                            <Typography variant="body2">
                              {latestBook?.progress ?? "Building course content…"}
                            </Typography>
                          </>
                        ) : latestBook?.status === "failed" ? (
                          <Alert severity="error">
                            {latestBook.error ?? "The latest course build failed."}
                          </Alert>
                        ) : (
                          <Alert severity="success">
                            No active generation job for this learner.
                          </Alert>
                        )}
                      </Stack>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
              <RateLimitManager registrationNumber={selectedSid} />
              <FinalRetakeReviewManager registrationNumber={selectedSid} />
              <TranscriptReviewManager registrationNumber={selectedSid} />
            </>
          )}
        </Stack>
      ) : null}

      {tab === 1 && selectedSid ? (
        <Stack spacing={3}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1.5} className="align-center">
                  <Avatar variant="rounded" className="admin-section-icon">
                    <AutoStoriesOutlined />
                  </Avatar>
                  <Stack>
                    <Typography variant="h5">Source and generation</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Current source files and the generation job they produced.
                    </Typography>
                  </Stack>
                </Stack>
                <TableContainer className="admin-table-scroll">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>File</TableCell>
                        <TableCell>Title</TableCell>
                        <TableCell align="right">Pages</TableCell>
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {state?.books.length ? (
                        state.books.map((book) => (
                          <TableRow key={book.id}>
                            <TableCell>{book.filename}</TableCell>
                            <TableCell>{book.title ?? "—"}</TableCell>
                            <TableCell align="right">{book.pages}</TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={book.status}
                                color={
                                  book.status === "ready"
                                    ? "success"
                                    : book.status === "failed"
                                      ? "error"
                                      : "default"
                                }
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4}>No source uploaded.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
                {building ? (
                  <Stack spacing={1}>
                    <LinearProgress />
                    <Typography variant="body2">
                      {latestBook?.progress ?? "Starting generation…"}
                    </Typography>
                  </Stack>
                ) : null}
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={2.5}>
                <Stack direction="row" spacing={1.5} className="align-center">
                  <Avatar variant="rounded" className="admin-section-icon">
                    <BuildOutlined />
                  </Avatar>
                  <Stack>
                    <Typography variant="h5">Rebuild policy</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Rebuild lectures, slides, quizzes, and sections as one consistent set.
                    </Typography>
                  </Stack>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  Question counts follow the assessment contract. Rebuild is only a recovery
                  action and no longer changes course size.
                </Typography>
                <Button
                  variant="contained"
                  color="warning"
                  disabled={busy || building}
                  onClick={() => setConfirmAction("regenerate")}
                  className="admin-action-button"
                >
                  Rebuild course
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Card className="admin-danger-zone">
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1.5} className="align-center">
                  <WarningAmberOutlined color="warning" />
                  <Typography variant="h5">Semester boundary</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  Before week 1 only. Restart clears attendance, grades, proctoring reports,
                  Q&amp;A history, and exam attempts. Generated source content remains.
                </Typography>
                <Button
                  variant="outlined"
                  color="warning"
                  disabled={busy || building || semesterStarted}
                  onClick={() => setConfirmAction("restart")}
                  className="admin-action-button"
                >
                  Restart semester
                </Button>
                {semesterStarted ? (
                  <Alert severity="info">
                    Week 1 has started. Historical records can no longer be reset.
                  </Alert>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      ) : null}

      {tab === 2 && selectedSid ? (
        <Stack spacing={2}>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreRounded />}>
              <Stack direction="row" spacing={1.5} className="align-center">
                <EventAvailableOutlined />
                <Typography variant="h6">Attendance</Typography>
                <Chip size="small" label={(state?.attendance.length ?? 0) + " records"} />
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} className="wrap-row">
                  <Chip color="success" label={"Attended " + summary.attendedCount} />
                  <Chip color="warning" label={"Partially attended " + summary.partiallyAttendedCount} />
                  <Chip color="error" label={"Absent " + summary.participationAbsentCount} />
                  <Chip variant="outlined" label={"In progress " + summary.inProgressCount} />
                  <Chip color="info" variant="outlined" label={"Connected now " + summary.connectedCount} />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  Attended: 70% or more · Partially attended: 50–69.9% · Absent: below
                  50%. In-progress coverage updates sentence by sentence.
                </Typography>
                <TableContainer className="admin-table-scroll">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Week</TableCell>
                        <TableCell>Lecture</TableCell>
                        <TableCell>Starts</TableCell>
                        <TableCell>Joined</TableCell>
                        <TableCell>Presence</TableCell>
                        <TableCell>Attendance</TableCell>
                        <TableCell align="right">Coverage</TableCell>
                        <TableCell align="right">Connected time</TableCell>
                        <TableCell align="right">Disconnects</TableCell>
                        <TableCell>Arrival</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {state?.attendance.map((record) => (
                        <TableRow key={record.lectureId}>
                          <TableCell>{record.week}</TableCell>
                          <TableCell>{record.title}</TableCell>
                          <TableCell>{formatDateTime(record.startsAt)}</TableCell>
                          <TableCell>{formatDateTime(record.joinedAt)}</TableCell>
                          <TableCell>
                            {record.isConnected ? (
                              <Chip size="small" color="success" label="Connected" />
                            ) : record.inProgress ? (
                              <Chip size="small" color="warning" variant="outlined" label="Waiting to rejoin" />
                            ) : (
                              "Offline"
                            )}
                          </TableCell>
                          <TableCell>
                            {record.attendanceStatus.replaceAll("_", " ")}
                            {record.inProgress ? " (in progress)" : ""}
                          </TableCell>
                          <TableCell align="right">
                            {record.attendancePercentage}% · {record.attendedLectureMinutes} min
                          </TableCell>
                          <TableCell align="right">
                            {record.connectedSeconds
                              ? formatCountdown(record.connectedSeconds * 1_000)
                              : "—"}
                          </TableCell>
                          <TableCell align="right">{record.disconnectCount}</TableCell>
                          <TableCell align="right">
                            {record.status === "late"
                              ? formatLateness(record.lateMinutes)
                              : record.status.replace("_", " ")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreRounded />}>
              <Stack direction="row" spacing={1.5} className="align-center">
                <FactCheckOutlined />
                <Typography variant="h6">Grades and integrity</Typography>
                <Chip size="small" label={(state?.grades.length ?? 0) + " records"} />
                {flaggedCount ? <Chip size="small" color="error" label={flaggedCount + " flagged"} /> : null}
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <TableContainer className="admin-table-scroll">
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
                    {state?.grades.map((grade) => (
                      <TableRow key={grade.id}>
                        <TableCell>{grade.kind}</TableCell>
                        <TableCell>{grade.week ?? "—"}</TableCell>
                        <TableCell align="right">
                          {grade.score} / {grade.max_score}
                        </TableCell>
                        <TableCell>{grade.feedback ?? "—"}</TableCell>
                        <TableCell>
                          <Stack spacing={1}>
                            <Chip
                              size="small"
                              color={grade.flagged ? "error" : "success"}
                              label={
                                grade.flagged
                                  ? "Flagged · score " + (grade.report?.suspicion_score ?? "?")
                                  : "Clean"
                              }
                            />
                            {grade.report?.integrity_penalty_applied ? (
                              <Typography variant="caption">
                                Raw {grade.report.raw_score ?? "?"} · recorded {grade.score}
                              </Typography>
                            ) : null}
                            {grade.report?.integrity_events?.length ? (
                              <Accordion disableGutters>
                                <AccordionSummary expandIcon={<ExpandMoreRounded />}>
                                  <Typography variant="caption">
                                    View {grade.report.integrity_events.length} integrity events
                                  </Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                  <Stack spacing={0.75}>
                                    {grade.report.integrity_events.map((event, index) => (
                                      <Typography variant="caption" component="div" key={`${event.at}-${event.type}-${index}`}>
                                        {formatDateTime(event.at)} · {event.type} · evidence {event.evidence_value ?? 0}
                                        {event.details && Object.keys(event.details).length
                                          ? ` · ${JSON.stringify(event.details)}`
                                          : ""}
                                      </Typography>
                                    ))}
                                  </Stack>
                                </AccordionDetails>
                              </Accordion>
                            ) : null}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreRounded />}>
              <Stack direction="row" spacing={1.5} className="align-center">
                <QueryStatsOutlined />
                <Typography variant="h6">Live lecture Q&amp;A</Typography>
                <Chip size="small" label={(state?.qaLog.length ?? 0) + " questions"} />
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <TableContainer className="admin-table-scroll">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Asked</TableCell>
                      <TableCell>Question</TableCell>
                      <TableCell>Answer</TableCell>
                      <TableCell>Model</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {state?.qaLog.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{formatDateTime(entry.asked_at)}</TableCell>
                        <TableCell>{entry.question}</TableCell>
                        <TableCell>{entry.answer}</TableCell>
                        <TableCell>{entry.model_used ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>
        </Stack>
      ) : null}

      {tab === 3 ? (
        <Stack spacing={3}>
          <Card>
            <CardContent>
              <Stack spacing={2.5}>
                <Stack direction="row" spacing={1.5} className="align-center">
                  <Avatar variant="rounded" className="admin-section-icon">
                    <ScheduleOutlined />
                  </Avatar>
                  <Stack>
                    <Typography variant="h5">Virtual clock</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Global control. Every learner observes the same virtual time.
                    </Typography>
                  </Stack>
                </Stack>
                <Alert severity="warning">
                  Time changes affect lecture windows, attendance, quizzes, midterms, and finals.
                </Alert>
                <Stack direction="row" spacing={1} className="wrap-row">
                  <Button disabled={busy} variant="outlined" onClick={() => control({ action: "advance", minutes: 5 })}>
                    +5 minutes
                  </Button>
                  <Button disabled={busy} variant="outlined" onClick={() => control({ action: "advance", hours: 1 })}>
                    +1 hour
                  </Button>
                  <Button disabled={busy} variant="outlined" onClick={() => control({ action: "advance", days: 1 })}>
                    +1 day
                  </Button>
                  <Button disabled={busy} variant="outlined" onClick={() => control({ action: "advance", weeks: 1 })}>
                    +1 week
                  </Button>
                  <Button
                    disabled={busy || !selectedSid}
                    variant="contained"
                    onClick={() => control({ action: "jumpToNextLecture", sid: selectedSid })}
                  >
                    Jump to selected learner’s next lecture
                  </Button>
                  <Button disabled={busy} color="secondary" onClick={() => control({ action: "reset" })}>
                    Reset to real time
                  </Button>
                </Stack>
                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <TextField
                    fullWidth
                    label="Set exact ISO time"
                    placeholder="2026-08-01T10:00:00Z"
                    slotProps={{ htmlInput: { "data-no-ui-translate": "true", dir: "ltr" } }}
                    value={isoInput}
                    onChange={(event) => setIsoInput(event.target.value)}
                  />
                  <Button
                    variant="contained"
                    disabled={busy || !isoInput}
                    onClick={() => control({ action: "set", iso: isoInput })}
                  >
                    Set time
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      ) : null}

      {tab === 4 ? (
        <Stack spacing={3}>
          <AdminFeedbackReports selectedRegistrationNumber={selectedSid || undefined} />
          <AdminNotificationMonitor selectedRegistrationNumber={selectedSid || undefined} />
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1.5} className="align-center">
                  <Avatar variant="rounded" className="admin-section-icon">
                    <ShieldOutlined />
                  </Avatar>
                  <Stack>
                    <Typography variant="h5">Privileged action trail</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Most recent admin and authentication operations.
                    </Typography>
                  </Stack>
                  <Button className="nav-actions" onClick={() => void loadAudit()}>
                    Refresh
                  </Button>
                </Stack>
                <TableContainer className="admin-table-scroll">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Time</TableCell>
                        <TableCell>Action</TableCell>
                        <TableCell>Actor</TableCell>
                        <TableCell>Target</TableCell>
                        <TableCell>Detail</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {audit.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>{formatDateTime(entry.created_at)}</TableCell>
                          <TableCell>{entry.action}</TableCell>
                          <TableCell>{entry.actor_email ?? "—"}</TableCell>
                          <TableCell>{entry.target_id ?? "—"}</TableCell>
                          <TableCell>{detailText(entry.detail)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={auditTotal}
                  page={auditPage}
                  rowsPerPage={auditPageSize}
                  rowsPerPageOptions={[10, 25, 50, 100]}
                  onPageChange={(_event, nextPage) => setAuditPage(nextPage)}
                  onRowsPerPageChange={(event) => {
                    setAuditPageSize(Number(event.target.value));
                    setAuditPage(0);
                  }}
                  labelRowsPerPage="Audit entries per page"
                />
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      ) : null}

      <Dialog
        open={confirmAction !== null}
        onClose={() => {
          if (!busy) setConfirmAction(null);
        }}
        maxWidth="sm"
      >
        <DialogTitle>
          {confirmAction === "restart" ? "Restart this semester?" : "Rebuild this course?"}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity={confirmAction === "restart" ? "error" : "warning"}>
              {confirmAction === "restart"
                ? "This clears attendance, grades, proctoring reports, Q&A history, and exam attempts. It cannot run after week 1 begins."
                : "This replaces the learner’s generated lectures, slides, quizzes, and sections with a new consistent set."}
            </Alert>
            <Typography>
              Learner: {selectedStudent?.name} · {selectedSid}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirmAction(null)}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            variant="contained"
            color={confirmAction === "restart" ? "error" : "warning"}
            onClick={() => {
              if (confirmAction === "restart") void restartSemester();
              if (confirmAction === "regenerate") void regenerate();
            }}
          >
            {busy ? "Working…" : confirmAction === "restart" ? "Restart semester" : "Rebuild course"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function AdminMetric({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "success" | "warning" | "error" | "default";
}) {
  const color = tone === "default" ? "primary" : tone;
  return (
    <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
      <Card className="admin-metric-card">
        <CardContent>
          <Stack spacing={1.5}>
            <Avatar variant="rounded" className={"admin-metric-icon admin-metric-" + color}>
              {icon}
            </Avatar>
            <Typography variant="overline" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="h5">{value}</Typography>
            <Typography variant="body2" color="text.secondary">
              {detail}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Grid>
  );
}
