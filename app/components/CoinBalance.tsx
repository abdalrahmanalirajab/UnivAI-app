"use client";

import { useCallback, useEffect, useState } from "react";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import TollOutlined from "@mui/icons-material/TollOutlined";
import type { SubscriptionSnapshot } from "@/lib/subscriptions";

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");
import MembershipDetailsDialog from "./MembershipDetailsDialog";

export default function CoinBalance() {
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/subscriptions", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { subscription?: SubscriptionSnapshot };
    if (body.subscription) setSubscription(body.subscription);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/subscriptions", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body: { subscription?: SubscriptionSnapshot } | null) => {
        if (active && body?.subscription) setSubscription(body.subscription);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!subscription) return null;
  return (
    <>
      <Tooltip title="Membership and coin details">
        <Chip
          clickable
          size="small"
          icon={<TollOutlined />}
          label={`${NUMBER_FORMATTER.format(subscription.coins.balance)} coins`}
          aria-label={`Open membership and coin details. ${NUMBER_FORMATTER.format(subscription.coins.balance)} coins`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            setOpen(true);
            void load();
          }}
        />
      </Tooltip>
      <MembershipDetailsDialog
        open={open}
        subscription={subscription}
        onClose={() => setOpen(false)}
        onSubscriptionChange={setSubscription}
      />
    </>
  );
}
