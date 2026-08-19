"use client";

import { useCallback, useEffect, useState } from "react";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import TollOutlined from "@mui/icons-material/TollOutlined";
import {
  CREDIT_BALANCE_CHANGED_EVENT,
  formatCreditBalance,
} from "@/lib/credit-balance-client";
import type { SubscriptionSnapshot } from "@/lib/subscriptions";
import MembershipDetailsDialog from "./MembershipDetailsDialog";

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

export default function CreditBalance() {
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async (activityPage = 1, activityPageSize = 10) => {
    try {
      const response = await fetch(
        `/api/subscriptions?activityPage=${activityPage}&activityPageSize=${activityPageSize}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const body = (await response.json()) as { subscription?: SubscriptionSnapshot };
      if (body.subscription) setSubscription(body.subscription);
    } catch {
      // The balance is helpful chrome; a transient refresh failure must not
      // interrupt the page the learner is using.
    }
  }, []);

  useEffect(() => {
    const refresh = () => void load();
    refresh();
    window.addEventListener(CREDIT_BALANCE_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(CREDIT_BALANCE_CHANGED_EVENT, refresh);
    };
  }, [load]);

  if (!subscription) return null;
  return (
    <>
      <Tooltip
        title={`Membership and Credit details — ${NUMBER_FORMATTER.format(subscription.credits.availableBalance)} Credits available`}
      >
        <Chip
          clickable
          size="small"
          icon={<TollOutlined />}
          label={`${formatCreditBalance(subscription.credits.availableBalance)} Credits`}
          aria-label={`Open membership and Credit details. ${NUMBER_FORMATTER.format(subscription.credits.availableBalance)} Credits available`}
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
        onActivityPageChange={load}
      />
    </>
  );
}
