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
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import UploadFileRounded from "@mui/icons-material/UploadFileRounded";
import {
  SUBSCRIPTION_PLANS,
  type SubscriptionPlanCode,
} from "@/lib/subscription-plans";
import type { SubscriptionSnapshot } from "@/lib/subscriptions";

type PaidPlan = Exclude<SubscriptionPlanCode, "free">;
const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

const PLAN_COPY: Record<
  SubscriptionPlanCode,
  { label: string; action: string; impact: string; features: string[] }
> = {
  free: {
    label: "For every learner",
    action: "Continue learning",
    impact: "All learning features with no payment required.",
    features: [
      "Complete UnivAI learning experience",
      "All assessments and certificates",
      "100 personalization coins weekly",
      "Coins roll over",
    ],
  },
  supporter: {
    label: "Support UnivAI",
    action: "Become a Supporter",
    impact: "Support the project and receive more personalization coins.",
    features: [
      "Everything in Free",
      "300 personalization coins weekly",
      "More room for visual customization",
      "Help keep learning open",
    ],
  },
  patron: {
    label: "Highest support",
    action: "Become a Patron",
    impact: "Our highest contribution tier for committed supporters.",
    features: [
      "Everything in Supporter",
      "1,000 personalization coins weekly",
      "Largest customization allowance",
      "Make the biggest monthly contribution",
    ],
  },
};

export default function SubscriptionWorkspace({
  checkoutCancelled,
}: {
  checkoutCancelled: boolean;
}) {
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null);
  const [loading, setLoading] = useState<PaidPlan | null>(null);
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
    void (async () => {
      if (checkoutCancelled) {
        const response = await fetch("/api/subscriptions/paypal/abort", { method: "POST" });
        if (!response.ok) throw new Error("Could not restore your membership after cancellation.");
      }
      await load();
    })().catch((caught) => {
      setError(caught instanceof Error ? caught.message : "Could not load your plan.");
    });
  }, [checkoutCancelled, load]);

  async function choosePaidPlan(planCode: PaidPlan) {
    setLoading(planCode);
    setError(null);
    try {
      const response = await fetch("/api/subscriptions/paypal/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode }),
      });
      const body = (await response.json()) as {
        approvalUrl?: string;
        subscription?: SubscriptionSnapshot;
        error?: string;
      };
      if (!response.ok || !body.approvalUrl) {
        throw new Error(body.error ?? "Could not start PayPal checkout.");
      }
      if (body.subscription) setSubscription(body.subscription);
      window.location.assign(body.approvalUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start PayPal checkout.");
      setLoading(null);
    }
  }

  const paidMembershipActive =
    subscription?.planCode !== "free" && subscription?.status === "active";

  return (
    <Stack spacing={4} className="subscription-workspace">
      <Stack spacing={0.75} className="subscription-hero">
        <Typography variant="h3" component="h1">
          Membership
        </Typography>
        <Typography color="text.secondary" className="subscription-lede">
          Every plan includes the same learning, assessments, transcript, and certificate. Paid
          plans support UnivAI and add weekly personalization coins.
        </Typography>
      </Stack>

      <Stack direction="row" spacing={2} className="subscription-action-rail align-center">
        <Stack spacing={0.15} className="subscription-action-copy">
          <Typography variant="subtitle2">Continue with Free</Typography>
          <Typography variant="caption" color="text.secondary">
            Membership is optional. You can upload your book now.
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} className="align-center subscription-action-buttons">
          <span className="subscription-desktop-policy">
            <Tooltip
              arrow
              placement="top"
              title={
                <Stack spacing={0.5}>
                  <Typography variant="subtitle2">No refunds</Typography>
                  <Typography variant="caption">
                    Membership payments are final. Revoking stops paid benefits immediately;
                    earned coins and Free learning access remain.
                  </Typography>
                </Stack>
              }
              slotProps={{ tooltip: { className: "subscription-refund-tooltip" } }}
            >
              <Chip icon={<InfoOutlined />} label="Payment policy" variant="outlined" clickable />
            </Tooltip>
          </span>
          <Button
            component={Link}
            href="/start"
            variant="contained"
            startIcon={<UploadFileRounded />}
            endIcon={<ArrowForwardRounded />}
          >
            Continue to upload
          </Button>
        </Stack>
      </Stack>

      <Alert severity="warning" icon={<InfoOutlined />} className="subscription-mobile-refund">
        <strong>No refunds.</strong> Payments are final; coins and Free access remain after
        revocation.
      </Alert>

      {checkoutCancelled ? (
        <Alert severity="info">PayPal checkout was cancelled. Your learning access is unchanged.</Alert>
      ) : null}
      {error ? <Alert severity="error">{error}</Alert> : null}

      {!subscription ? (
        <Stack className="subscription-loading">
          <CircularProgress aria-label="Loading membership" />
        </Stack>
      ) : null}

      <Grid container spacing={2.5} className="subscription-pricing-grid">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const current =
            subscription?.planCode === plan.code &&
            (plan.code === "free" || subscription.status === "active");
          const featured = plan.code === "supporter";
          const paidPlan = plan.code === "free" ? null : plan.code;
          const copy = PLAN_COPY[plan.code];
          return (
            <Grid size={{ xs: 12, md: 4 }} key={plan.code}>
              <Card
                variant="outlined"
                className={`subscription-plan-card subscription-plan-${plan.code} ${featured ? "subscription-plan-featured" : ""}`}
              >
                <CardContent>
                  <Stack spacing={2.25}>
                    <Stack direction="row" className="spread-row align-start">
                      <Stack spacing={0.35}>
                        <Typography variant="h4" component="h2">
                          {plan.name}
                        </Typography>
                        <Typography variant="overline" className="subscription-plan-label">
                          {copy.label}
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.75}>
                        {featured ? <Chip size="small" variant="outlined" label="Popular" /> : null}
                        {current ? <Chip size="small" color="success" label="Current" /> : null}
                      </Stack>
                    </Stack>

                    <Typography color="text.secondary" className="subscription-plan-impact">
                      {copy.impact}
                    </Typography>

                    <Stack direction="row" spacing={0.75} className="align-end subscription-price-row">
                      <Typography variant="h5" className="subscription-currency">
                        $
                      </Typography>
                      <Typography variant="h2" className="subscription-price">
                        {plan.monthlyPriceUsd}
                      </Typography>
                      <Typography color="text.secondary" className="subscription-price-period">
                        {plan.monthlyPriceUsd ? "per month" : "forever"}
                      </Typography>
                    </Stack>

                    <Stack direction="row" className="subscription-coin-allowance align-end">
                      <Typography variant="h5">
                        {NUMBER_FORMATTER.format(plan.weeklyCoins)}
                      </Typography>
                      <Stack spacing={0}>
                        <Typography variant="body2">coins each week</Typography>
                        <Typography variant="caption" color="text.secondary">
                          For optional personalization
                        </Typography>
                      </Stack>
                    </Stack>

                    <Divider />

                    <Stack spacing={1.15} className="subscription-feature-panel">
                      {copy.features.map((feature) => (
                        <Stack key={feature} direction="row" spacing={1} className="align-start">
                          <CheckCircleRounded className="subscription-feature-check" fontSize="small" />
                          <Typography variant="body2">{feature}</Typography>
                        </Stack>
                      ))}
                    </Stack>
                  </Stack>
                </CardContent>
                <CardActions>
                  {paidPlan === null ? (
                    <Button
                      component={Link}
                      href="/start"
                      fullWidth
                      variant={current ? "contained" : "outlined"}
                      className="subscription-plan-action"
                    >
                      {copy.action}
                    </Button>
                  ) : (
                    <Button
                      fullWidth
                      variant={featured ? "contained" : "outlined"}
                      className="subscription-plan-action"
                      disabled={Boolean(loading) || current || paidMembershipActive}
                      onClick={() => void choosePaidPlan(paidPlan)}
                    >
                      {loading === plan.code
                        ? "Opening PayPal..."
                        : current
                          ? "Current plan"
                          : paidMembershipActive
                            ? "Current membership active"
                            : copy.action}
                    </Button>
                  )}
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>

    </Stack>
  );
}
