"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

type State = "checking" | "active" | "pending" | "failed";

export default function PayPalReturn({ subscriptionId }: { subscriptionId: string | null }) {
  const [state, setState] = useState<State>(subscriptionId ? "checking" : "failed");
  const [message, setMessage] = useState(
    subscriptionId ? "Checking your PayPal subscription…" : "PayPal returned no subscription ID.",
  );

  useEffect(() => {
    if (!subscriptionId) return;
    let active = true;
    void fetch("/api/subscriptions/paypal/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId }),
    })
      .then(async (response) => {
        const body = (await response.json()) as { active?: boolean; error?: string };
        if (!response.ok && response.status !== 202) {
          throw new Error(body.error ?? "Could not verify the PayPal subscription.");
        }
        if (!active) return;
        if (body.active) {
          setState("active");
          setMessage("Your membership is active and your weekly coin allowance is updated.");
        } else {
          setState("pending");
          setMessage("PayPal is still activating the membership. You can keep learning while it finishes.");
        }
      })
      .catch((caught) => {
        if (!active) return;
        setState("failed");
        setMessage(caught instanceof Error ? caught.message : "Could not verify the PayPal subscription.");
      });
    return () => {
      active = false;
    };
  }, [subscriptionId]);

  return (
    <Stack spacing={3} className="paypal-return-card">
      <Typography variant="h4">PayPal membership</Typography>
      {state === "checking" ? <CircularProgress /> : null}
      <Alert severity={state === "failed" ? "error" : state === "active" ? "success" : "info"}>
        {message}
      </Alert>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <Button component={Link} href="/start" variant="contained">
          Continue learning
        </Button>
        <Button component={Link} href="/subscribe" variant="outlined">
          View plan and coins
        </Button>
      </Stack>
    </Stack>
  );
}
