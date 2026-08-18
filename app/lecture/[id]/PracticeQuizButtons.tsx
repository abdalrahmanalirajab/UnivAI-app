"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import QuizRounded from "@mui/icons-material/QuizRounded";
import { CREDIT_COSTS } from "@/lib/credit-costs";

export default function PracticeQuizButtons({ lectureId }: { lectureId: string }) {
  const [pending, setPending] = useState<"generate" | "resume" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function openPractice(kind: "generate" | "resume") {
    if (pending) return;
    setPending(kind);
    setMessage(null);
    try {
      const response = await fetch(`/api/lectures/${lectureId}/practice`, {
        method: kind === "generate" ? "POST" : "GET",
        headers: kind === "generate" ? { "Content-Type": "application/json" } : undefined,
        body: kind === "generate"
          ? JSON.stringify({ idempotencyKey: crypto.randomUUID() })
          : undefined,
      });
      const payload = await response.json().catch(() => null) as {
        launchUrl?: unknown;
        error?: unknown;
      } | null;
      if (!response.ok || typeof payload?.launchUrl !== "string") {
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "The practice quiz could not be opened.",
        );
      }
      window.location.assign(payload.launchUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The practice quiz could not be opened.");
      setPending(null);
    }
  }

  return (
    <Stack spacing={1.5}>
      {message ? <Alert severity="warning">{message}</Alert> : null}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button
          variant="contained"
          startIcon={pending === "generate" ? <CircularProgress size={18} /> : <QuizRounded />}
          disabled={pending !== null}
          onClick={() => void openPractice("generate")}
        >
          Generate 5-question practice · {CREDIT_COSTS.practice_quiz} Credits
        </Button>
        <Button
          variant="outlined"
          startIcon={pending === "resume" ? <CircularProgress size={18} /> : <PlayArrowRounded />}
          disabled={pending !== null}
          onClick={() => void openPractice("resume")}
        >
          Resume latest practice
        </Button>
      </Stack>
    </Stack>
  );
}
