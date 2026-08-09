"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Chip from "@mui/material/Chip";
import TollOutlined from "@mui/icons-material/TollOutlined";

export default function CoinBalance() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/subscriptions", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          subscription?: { coins?: { balance?: number } };
        };
      })
      .then((body) => {
        const value = body?.subscription?.coins?.balance;
        if (active && typeof value === "number") setBalance(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (balance === null) return null;
  return (
    <Chip
      component={Link}
      href="/subscribe"
      clickable
      size="small"
      icon={<TollOutlined />}
      label={`${balance.toLocaleString()} coins`}
    />
  );
}
