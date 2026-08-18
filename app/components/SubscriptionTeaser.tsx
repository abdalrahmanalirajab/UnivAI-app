"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";

type Milestone = "course-progress" | "lecture-finished" | "course-finished";

const COPY: Record<Milestone, { title: string; body: string }> = {
  "course-progress": {
    title: "Your learning journey is taking shape.",
    body: "Support UnivAI and receive more Credits for optional AI learning actions.",
  },
  "lecture-finished": {
    title: "One more milestone reached.",
    body: "Supporter memberships add Credits every seven days—never for grades or core access.",
  },
  "course-finished": {
    title: "Make the celebration yours.",
    body: "Back UnivAI and receive our largest Credit grant for optional AI learning actions.",
  },
};

export default function SubscriptionTeaser({ milestone }: { milestone: Milestone }) {
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    const storageKey = `univai:membership-teaser:${milestone}`;
    try {
      const lastShown = Number(window.localStorage.getItem(storageKey) ?? 0);
      if (Date.now() - lastShown < 7 * 24 * 60 * 60 * 1000) return () => undefined;
    } catch {
      // Storage can be unavailable in private browsing; the teaser still works.
    }
    void fetch("/api/subscriptions", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          subscription?: { planCode?: string; pendingPlanCode?: string | null };
        };
      })
      .then((body) => {
        if (!active || !body?.subscription) return;
        const shouldShow = body.subscription.planCode === "free";
        setVisible(shouldShow);
        setPending(Boolean(body.subscription.pendingPlanCode));
        if (shouldShow) {
          try {
            window.localStorage.setItem(storageKey, String(Date.now()));
          } catch {
            // Non-essential frequency control only.
          }
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [milestone]);

  if (!visible) return null;
  const copy = COPY[milestone];
  return (
    <Card variant="outlined" className="subscription-teaser">
      <CardContent>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} className="align-center">
          <AutoAwesomeRounded color="secondary" className="subscription-teaser-icon" />
          <Stack spacing={0.5} className="subscription-teaser-copy">
            <Typography variant="h6">{copy.title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {copy.body}
            </Typography>
          </Stack>
          <Button component={Link} href="/subscribe" variant="outlined">
            {pending ? "Finish membership" : "See memberships"}
          </Button>
          <IconButton
            aria-label="Dismiss membership suggestion"
            size="small"
            onClick={() => setVisible(false)}
          >
            <CloseRounded fontSize="small" />
          </IconButton>
        </Stack>
      </CardContent>
    </Card>
  );
}
