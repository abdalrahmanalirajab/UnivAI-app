"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import type { LectureMakeupState } from "@/lib/lecture-makeup";
import LectureRoom from "./LectureRoom";

type Props = {
  lectureId: string;
  week: number;
  title: string;
  initialState: LectureMakeupState;
};

export default function MakeupLectureGate({ lectureId, week, title, initialState }: Props) {
  const [state, setState] = useState(initialState);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state === "active") return <LectureRoom lectureId={lectureId} />;

  if (state === "completed" || state === "expired") {
    return (
      <Stack spacing={3}>
        <Typography variant="h4">Week {week} make-up lecture</Typography>
        <Alert severity={state === "completed" ? "success" : "warning"}>
          <AlertTitle>{state === "completed" ? "Make-up completed" : "Make-up closed"}</AlertTitle>
          {state === "completed"
            ? "Your attendance was saved when this one-time lecture finished. It cannot be replayed."
            : "The first-entry window ended after the make-up was started. This one-time access cannot be restarted."}
        </Alert>
        <Button component={Link} href="/schedule" variant="contained">
          Return to schedule
        </Button>
      </Stack>
    );
  }

  async function start(): Promise<void> {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch(`/api/lecture/${lectureId}/makeup/start`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not start the make-up lecture.");
      if (body.makeup?.state !== "active") {
        throw new Error("The make-up lecture did not enter its active state.");
      }
      setState("active");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start the make-up lecture.");
      setStarting(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="overline" color="text.secondary">
          Week {week} · administrator-approved make-up
        </Typography>
        <Typography variant="h4" data-generated-content="true" dir="auto">
          {title}
        </Typography>
      </Stack>

      <Alert severity="warning">
        <AlertTitle>Confirm your one-time start</AlertTitle>
        The lecture clock starts when you confirm. After completion, this lecture cannot be
        replayed or started again.
      </Alert>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Chip color="success" label="Full interactive lecture" />
              <Chip variant="outlined" label="Questions and raise hand available" />
              <Chip color="warning" variant="outlined" label="One-time access" />
            </Stack>
            <Typography variant="body1">
              This runs exactly like a scheduled live lecture: the lecturer speaks, slides advance,
              you can raise your hand and ask questions, and attendance is calculated from the
              content you actually watch.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              If your connection drops after joining, reopen the lecture to continue from your
              saved point. Your progress never resets to the beginning.
            </Typography>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <Stack direction="row" spacing={1}>
              <Button component={Link} href="/schedule" disabled={starting}>
                Not now
              </Button>
              <Button variant="contained" disabled={starting} onClick={() => void start()}>
                {starting ? <CircularProgress size={22} color="inherit" /> : "Confirm and start now"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
