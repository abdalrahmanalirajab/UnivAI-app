"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import AutoStoriesOutlined from "@mui/icons-material/AutoStoriesOutlined";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import FolderCopyOutlined from "@mui/icons-material/FolderCopyOutlined";
import QuizOutlined from "@mui/icons-material/QuizOutlined";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";
import { formatDateTime, formatRelative, useVirtualClock } from "@/lib/time";
import { useHydratedSession } from "@/lib/use-hydrated-session";
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

type DashboardData = {
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
  final: ExamServiceStatusV1 | null;
};

type Lecture = {
  session_type?: "lecture";
  id: string;
  week: number;
  title: string;
  startsAt: string;
  endsAt: string;
  state: "upcoming" | "live" | "done";
  joinable: boolean;
  completed: boolean;
};

type Exam = {
  kind: "quiz" | "mid";
  week: number | null;
  title: string;
  opensAt: string;
  closesAt: string;
  state: "locked" | "open" | "missed" | "submitted";
};

type FocusAction = {
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  label: string;
  tone: "live" | "assessment" | "upcoming" | "complete" | "preparing";
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error ?? `Could not load ${url}.`);
  }
  return body as T;
}

export default function DashboardPage() {
  const { data: session } = useHydratedSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const now = useVirtualClock();

  const load = useCallback(async () => {
    const [dashboardResult, lecturesResult, examsResult] = await Promise.allSettled([
      fetchJson<DashboardData>("/api/dashboard"),
      fetchJson<{ lectures: Array<Lecture | { session_type: "section" }> }>(
        "/api/lectures",
      ),
      fetchJson<{ exams: Exam[] }>("/api/exams"),
    ]);

    if (dashboardResult.status === "rejected") {
      setError(dashboardResult.reason instanceof Error
        ? dashboardResult.reason.message
        : "Could not load your learning day.");
      return;
    }

    setData(dashboardResult.value);
    if (lecturesResult.status === "fulfilled") {
      setLectures(
        lecturesResult.value.lectures.filter(
          (record): record is Lecture => record.session_type !== "section",
        ),
      );
    }
    if (examsResult.status === "fulfilled") {
      setExams(examsResult.value.exams);
    }
    setError(
      lecturesResult.status === "rejected" || examsResult.status === "rejected"
        ? "Some course details are still loading. Your main action is available."
        : null,
    );
  }, []);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(refresh);
  }, [load]);

  const focus: FocusAction = (() => {
    const live = lectures.find((lecture) => lecture.state === "live" && lecture.joinable);
    if (live) {
      return {
        eyebrow: "Live now",
        title: `Week ${live.week}: ${live.title}`,
        body: "Your lecturer is waiting. Join the room and continue from the current slide.",
        href: `/lecture/${live.id}`,
        label: "Join lecture",
        tone: "live",
      };
    }

    const openExam = [...exams]
      .filter((exam) => exam.state === "open")
      .sort((a, b) => new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime())[0];
    if (openExam) {
      return {
        eyebrow: "Due now",
        title: openExam.title,
        body: `This ${openExam.kind === "mid" ? "midterm" : "quiz"} is open now and closes ${
          now ? formatRelative(openExam.closesAt, now) : "soon"
        }.`,
        href: "/exams",
        label: `Take ${openExam.kind === "mid" ? "midterm" : "quiz"}`,
        tone: "assessment",
      };
    }

    if (data?.final?.state === "ready" || data?.final?.state === "active") {
      return {
        eyebrow: data.final.state === "active" ? "In progress" : "Ready now",
        title: "Final exam",
        body:
          data.final.state === "active"
            ? "Your final attempt is already active. Return to the assessment page to continue."
            : "Your semester is complete and the final exam is now available.",
        href: "/exams",
        label: data.final.state === "active" ? "Continue final" : "Start final",
        tone: "assessment",
      };
    }

    const next = lectures.find((lecture) => lecture.state === "upcoming");
    if (next) {
      return {
        eyebrow: "Up next",
        title: `Week ${next.week}: ${next.title}`,
        body: `${now ? formatRelative(next.startsAt, now) : "Coming soon"} · ${formatDateTime(
          next.startsAt,
        )}`,
        href: "/schedule",
        label: "View course",
        tone: "upcoming",
      };
    }

    if (lectures.length > 0 && lectures.every((lecture) => lecture.state === "done")) {
      return {
        eyebrow: "Lectures complete",
        title: "Finish your remaining assessments",
        body: "Your lecture schedule has ended. Check whether an assessment or final is ready.",
        href: "/exams",
        label: "Check assessments",
        tone: "complete",
      };
    }

    return {
      eyebrow: "Course setup",
      title: "Your course is being prepared",
      body: "We will place your first lecture here as soon as its schedule is ready.",
      href: "/library",
      label: "View your books",
      tone: "preparing",
    };
  })();

  if (!data) {
    return (
      <Stack className="dashboard-loading" spacing={2} aria-live="polite">
        <CircularProgress size={32} />
        <Typography color="text.secondary">Preparing your next step…</Typography>
      </Stack>
    );
  }

  const endedLectures = lectures.filter((lecture) => lecture.state === "done").length;
  const courseProgress = lectures.length
    ? Math.round((endedLectures / lectures.length) * 100)
    : 0;
  const submittedAssessments = exams.filter((exam) => exam.state === "submitted").length;
  const openAssessments = exams.filter((exam) => exam.state === "open").length;
  const learnerName = session?.user.name?.split(" ")[0] ?? "there";

  return (
    <Stack spacing={4}>
      <Stack spacing={0.75}>
        <Typography variant="overline" color="primary">
          Your learning day
        </Typography>
        <Typography variant="h3" component="h1">
          Welcome back, {learnerName}.
        </Typography>
        <Typography color="text.secondary">
          One useful next step, without the noise.
        </Typography>
      </Stack>

      {error ? (
        <Alert
          severity="info"
          action={<Button onClick={() => void load()}>Retry</Button>}
        >
          {error}
        </Alert>
      ) : null}

      <Card className={`today-focus-card today-focus-${focus.tone}`}>
        <CardContent>
          <Grid container spacing={3} className="align-center">
            <Grid size={{ xs: 12, md: 8 }}>
              <Stack spacing={1.5}>
                <Chip size="small" label={focus.eyebrow} className="focus-chip" />
                <Typography variant="h4" component="h2">
                  {focus.title}
                </Typography>
                <Typography color="text.secondary" className="today-focus-copy">
                  {focus.body}
                </Typography>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Button
                fullWidth
                size="large"
                variant="contained"
                component={Link}
                href={focus.href}
                endIcon={<ArrowForwardRounded />}
              >
                {focus.label}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card className="pulse-card">
            <CardContent>
              <Stack spacing={2}>
                <Avatar variant="rounded" className="pulse-icon">
                  <AutoStoriesOutlined />
                </Avatar>
                <Stack spacing={0.5}>
                  <Typography variant="h6">Course progress</Typography>
                  <Typography variant="h4">{courseProgress}%</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {endedLectures} of {lectures.length || "—"} lecture weeks finished
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={courseProgress}
                  aria-label={`Course progress ${courseProgress} percent`}
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card className="pulse-card">
            <CardContent>
              <Stack spacing={2}>
                <Avatar variant="rounded" className="pulse-icon">
                  <QuizOutlined />
                </Avatar>
                <Stack spacing={0.5}>
                  <Typography variant="h6">Assessments</Typography>
                  <Typography variant="h4">
                    {openAssessments ? `${openAssessments} open` : "All clear"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {submittedAssessments} submitted so far
                  </Typography>
                </Stack>
                <Button component={Link} href="/exams" size="small">
                  View assessments
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card className="pulse-card">
            <CardContent>
              <Stack spacing={2}>
                <Avatar variant="rounded" className="pulse-icon">
                  <EventAvailableOutlined />
                </Avatar>
                <Stack spacing={0.5}>
                  <Typography variant="h6">Attendance</Typography>
                  <Typography variant="h4">
                    {data.summary.onTimeCount + data.summary.lateCount} attended
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {data.summary.onTimeCount} on time · {data.summary.lateCount} late
                  </Typography>
                </Stack>
                <Button component={Link} href="/schedule" size="small">
                  View course timeline
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Stack spacing={1.5}>
        <Typography variant="h6">More when you need it</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
          <Button component={Link} href="/schedule" startIcon={<EventAvailableOutlined />}>
            Full course
          </Button>
          <Button component={Link} href="/library" startIcon={<FolderCopyOutlined />}>
            Books
          </Button>
          {data.final?.state === "graded" ? (
            <>
              <Button
                component={Link}
                href="/transcript"
                startIcon={<WorkspacePremiumOutlined />}
              >
                Transcript
              </Button>
              <Chip
                color="success"
                icon={<CheckCircleRounded />}
                label="Final grade ready"
                className="dashboard-status-chip"
              />
            </>
          ) : null}
        </Stack>
      </Stack>
    </Stack>
  );
}
