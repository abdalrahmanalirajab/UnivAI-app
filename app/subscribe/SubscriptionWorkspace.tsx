"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import TollOutlined from "@mui/icons-material/TollOutlined";
import {
  SUBSCRIPTION_PLANS,
  isSubscriptionPlanCode,
  type SubscriptionPlanCode,
} from "@/lib/subscription-plans";
import type { SubscriptionSnapshot } from "@/lib/subscriptions";

type PaidPlan = Exclude<SubscriptionPlanCode, "free">;

export default function SubscriptionWorkspace({
  requestedPlan,
  checkoutCancelled,
}: {
  requestedPlan: string | null;
  checkoutCancelled: boolean;
}) {
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null);
  const [loading, setLoading] = useState<PaidPlan | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/subscriptions", { cache: "no-store" });
    const body = (await response.json()) as {
      subscription?: SubscriptionSnapshot;
      error?: string;
    };
    if (!response.ok || !body.subscription) {
      throw new Error(body.error ?? "Could not load your plan.");
    }
    setSubscription(body.subscription);
  }, []);

  useEffect(() => {
    void load().catch((caught) => {
      setError(caught instanceof Error ? caught.message : "Could not load your plan.");
    });
  }, [load]);

  async function choosePaidPlan(planCode: PaidPlan) {
    setLoading(planCode);
    setError(null);
    try {
      const response = await fetch("/api/subscriptions/paypal/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode }),
      });
      const body = (await response.json()) as { approvalUrl?: string; error?: string };
      if (!response.ok || !body.approvalUrl) {
        throw new Error(body.error ?? "Could not start PayPal checkout.");
      }
      window.location.assign(body.approvalUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start PayPal checkout.");
      setLoading(null);
    }
  }

  async function cancelPlan() {
    setLoading("cancel");
    setError(null);
    try {
      const response = await fetch("/api/subscriptions/paypal/cancel", { method: "POST" });
      const body = (await response.json()) as {
        subscription?: SubscriptionSnapshot;
        error?: string;
      };
      if (!response.ok || !body.subscription) {
        throw new Error(body.error ?? "Could not cancel your plan.");
      }
      setSubscription(body.subscription);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not cancel your plan.");
    } finally {
      setLoading(null);
    }
  }

  const selectedRequest =
    isSubscriptionPlanCode(requestedPlan) && requestedPlan !== "free"
      ? requestedPlan
      : null;

  return (
    <Stack spacing={3} className="subscription-workspace">
      <Stack spacing={1}>
        <Typography variant="overline" color="primary.main">
          Membership and coins
        </Typography>
        <Typography variant="h3">Support the platform, never pay to learn.</Typography>
        <Typography color="text.secondary" className="subscription-lede">
          Every learner receives the same course, teaching, assessments, grades,
          transcript, and certificate. A paid membership only adds coins for optional
          visual and profile personalization we will release later.
        </Typography>
      </Stack>

      {checkoutCancelled ? (
        <Alert severity="info">PayPal checkout was cancelled. Your Free plan is still available.</Alert>
      ) : null}
      {error ? <Alert severity="error">{error}</Alert> : null}

      {subscription ? (
        <Card variant="outlined" className="coin-wallet-card">
          <CardContent>
            <Grid container spacing={2} className="align-center">
              <Grid size="grow">
                <Typography variant="overline">Current plan</Typography>
                <Typography variant="h5">{subscription.planName}</Typography>
              </Grid>
              <Grid>
                <Chip
                  color="primary"
                  icon={<TollOutlined />}
                  label={`${subscription.coins.balance.toLocaleString()} coins`}
                />
              </Grid>
              <Grid>
                <Typography variant="body2" color="text.secondary">
                  +{subscription.coins.weeklyAllowance.toLocaleString()} every Monday
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      ) : (
        <CircularProgress aria-label="Loading membership" />
      )}

      <Grid container spacing={2}>
        {SUBSCRIPTION_PLANS.map((plan) => {
          const current = subscription?.planCode === plan.code && subscription.status === "active";
          const requested = selectedRequest === plan.code;
          const paidPlan = plan.code === "free" ? null : plan.code;
          return (
            <Grid size={{ xs: 12, md: 4 }} key={plan.code}>
              <Card
                variant="outlined"
                className={`subscription-plan-card ${requested ? "subscription-plan-requested" : ""}`}
              >
                <CardContent>
                  <Stack spacing={1.25}>
                    <Stack direction="row" className="spread-row align-center">
                      <Typography variant="h5">{plan.name}</Typography>
                      {current ? <Chip size="small" color="success" label="Current" /> : null}
                    </Stack>
                    <Typography variant="h3">
                      ${plan.monthlyPriceUsd}
                      <Typography component="span" color="text.secondary">
                        {plan.monthlyPriceUsd ? " / month" : " forever"}
                      </Typography>
                    </Typography>
                    <Typography color="primary.main" className="plan-coin-allowance">
                      {plan.weeklyCoins.toLocaleString()} coins every week
                    </Typography>
                    <Typography color="text.secondary">{plan.description}</Typography>
                    {["All learning included", "No paid grades or exam advantage", "Coins never expire"].map(
                      (benefit) => (
                        <Stack key={benefit} direction="row" spacing={1} className="align-center">
                          <CheckCircleRounded color="success" fontSize="small" />
                          <Typography variant="body2">{benefit}</Typography>
                        </Stack>
                      ),
                    )}
                  </Stack>
                </CardContent>
                <CardActions>
                  {paidPlan === null ? (
                    <Button component={Link} href="/start" fullWidth variant={current ? "outlined" : "text"}>
                      Continue learning free
                    </Button>
                  ) : (
                    <Button
                      fullWidth
                      variant={requested ? "contained" : "outlined"}
                      disabled={Boolean(loading) || current}
                      onClick={() => void choosePaidPlan(paidPlan)}
                    >
                      {loading === plan.code ? "Opening PayPal…" : current ? "Current plan" : `Choose ${plan.name}`}
                    </Button>
                  )}
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {subscription?.provider === "paypal" && subscription.status === "active" ? (
        <Stack spacing={1} className="subscription-cancel-row">
          <Typography variant="body2" color="text.secondary">
            Cancellation returns your future weekly allowance to Free. Coins already earned stay yours.
          </Typography>
          <Button
            color="error"
            variant="outlined"
            disabled={Boolean(loading)}
            onClick={() => void cancelPlan()}
          >
            {loading === "cancel" ? "Cancelling…" : "Cancel membership"}
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
}
