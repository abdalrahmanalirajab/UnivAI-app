"use client";

import { useState } from "react";
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
import type { SlideDeck } from "@/lib/lectures";
import SubscriptionTeaser from "@/app/components/SubscriptionTeaser";

export default function LectureArchive({ deck }: { deck: SlideDeck }) {
  const [index, setIndex] = useState(0);
  const current = deck.slides[index];

  if (!current) {
    return <Alert severity="warning">This presentation has no published slides yet.</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Chip label={`Slide ${index + 1} of ${deck.slides.length}`} color="primary" />
        <Chip label="Read-only archive" variant="outlined" />
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
