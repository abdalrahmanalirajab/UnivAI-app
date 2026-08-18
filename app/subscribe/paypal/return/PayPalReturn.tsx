"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

type State = "checking" | "active" | "pending" | "failed";

export default function PayPalReturn({
  checkoutId,
  demoOrder,
}: {
  checkoutId: string | null;
  demoOrder: boolean;
}) {
  const [state, setState] = useState<State>(checkoutId ? "checking" : "failed");
  const [message, setMessage] = useState(
    checkoutId ? "Completing your PayPal payment…" : "PayPal returned no checkout ID.",
  );

  useEffect(() => {
    if (!checkoutId) return;
    let active = true;
    void fetch(
      demoOrder
        ? "/api/subscriptions/paypal/demo-capture"
        : "/api/subscriptions/paypal/confirm",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          demoOrder ? { orderId: checkoutId } : { subscriptionId: checkoutId },
        ),
      },
    )
      .then(async (response) => {
        const body = (await response.json()) as { active?: boolean; error?: string };
        if (!response.ok && response.status !== 202) {
          throw new Error(body.error ?? "Could not verify the PayPal subscription.");
        }
        if (!active) return;
        if (body.active) {
          setState("active");
          setMessage("Payment completed. Your membership and full Credit grant are active.");
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
  }, [checkoutId, demoOrder]);

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
          View plan and Credits
        </Button>
      </Stack>
    </Stack>
  );
}
