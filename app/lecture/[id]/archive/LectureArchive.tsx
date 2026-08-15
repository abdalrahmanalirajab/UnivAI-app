"use client";

import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import RecordVoiceOverRounded from "@mui/icons-material/RecordVoiceOverRounded";
import StopRounded from "@mui/icons-material/StopRounded";
import type { Segment, SlideDeck } from "@/lib/lectures";
import SubscriptionTeaser from "@/app/components/SubscriptionTeaser";

export default function LectureArchive({ deck, narration }: { deck: SlideDeck; narration: Segment[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const current = deck.slides[index];
  const narrationText = useMemo(
    () => current
      ? narration.filter((segment) => segment.slide === current.slide).map((segment) => segment.text).join(" ")
      : "",
    [current, narration],
  );

  useEffect(() => {
    setSpeechSupported("speechSynthesis" in window);
  }, []);

  useEffect(() => {
    if (!playing || !current || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (!narrationText) {
      if (index < deck.slides.length - 1) setIndex((value) => value + 1);
      else setPlaying(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(narrationText);
    utterance.lang = "en";
    utterance.rate = 1;
    utterance.onend = () => {
      if (index < deck.slides.length - 1) setIndex((value) => value + 1);
      else setPlaying(false);
    };
    utterance.onerror = () => setPlaying(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return () => {
      utterance.onend = null;
      utterance.onerror = null;
      window.speechSynthesis.cancel();
    };
  }, [current, deck.slides.length, index, narrationText, playing]);

  if (!current) {
    return <Alert severity="warning">This presentation has no published slides yet.</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Chip label={`Slide ${index + 1} of ${deck.slides.length}`} color="primary" />
        <Chip label="Read-only archive" variant="outlined" />
        <Chip label="Does not change attendance" variant="outlined" />
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button
          variant="contained"
          startIcon={<RecordVoiceOverRounded />}
          disabled={narration.length === 0 || !speechSupported}
          onClick={() => {
            if (index === deck.slides.length - 1) setIndex(0);
            setPlaying(true);
          }}
        >
          {playing ? "Narrated replay is playing" : "Play narrated lecture"}
        </Button>
        <Button
          startIcon={<StopRounded />}
          disabled={!playing}
          onClick={() => {
            if (speechSupported) window.speechSynthesis.cancel();
            setPlaying(false);
          }}
        >
          Stop
        </Button>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <iframe
            key={current.slide}
            src={`/api/presentation/${deck.presentationId}/${current.slide}`}
            title={`Week ${deck.week}: ${deck.title}, slide ${current.slide}`}
            width="100%"
            height="620"
            frameBorder="0"
            allowFullScreen
            referrerPolicy="same-origin"
          />
        </CardContent>
      </Card>

      <Stack spacing={1}>
        <Typography variant="subtitle1">{current.heading}</Typography>
        {current.bullets.length > 0 ? (
          <Typography variant="body2" color="text.secondary">
            {current.bullets.join(" • ")}
          </Typography>
        ) : null}
        {narrationText ? (
          <Typography variant="body2">
            <strong>Narration:</strong> {narrationText}
          </Typography>
        ) : null}
      </Stack>

      <Divider />

      <Stack direction="row" spacing={1}>
        <Button
          startIcon={<ArrowBackRounded />}
          disabled={index === 0}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
        >
          Previous
        </Button>
        <Button
          endIcon={<ArrowForwardRounded />}
          disabled={index === deck.slides.length - 1}
          onClick={() => setIndex((value) => Math.min(deck.slides.length - 1, value + 1))}
        >
          Next
        </Button>
      </Stack>

      <SubscriptionTeaser milestone="lecture-finished" />
    </Stack>
  );
}
