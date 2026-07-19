"use client";

import moment from "moment";
import { useCallback, useEffect, useState } from "react";

/**
 * Human time, told against the VIRTUAL clock.
 *
 * moment().fromNow() measures from the real clock, which is wrong everywhere in
 * this app: the admin page moves time, so a lecture that is live right now might
 * be three weeks away in real time. Every relative phrase here is measured from
 * virtual now instead.
 */

export const DATE_TIME = "ddd D MMM, HH:mm";

/** "Wed 15 Jul, 10:00" */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return moment(value).format(DATE_TIME);
}

/** "in 2 days" / "7 minutes ago" — measured from virtual now, not the wall clock. */
export function formatRelative(
  value: string | Date | null | undefined,
  virtualNow: Date | null
): string {
  if (!value || !virtualNow) return "";
  return moment(value).from(moment(virtualNow));
}

/** "in 2 days (Wed 15 Jul, 10:00)" */
export function formatWhen(
  value: string | Date | null | undefined,
  virtualNow: Date | null
): string {
  if (!value) return "—";
  const when = formatRelative(value, virtualNow);
  return when ? `${when} — ${formatDateTime(value)}` : formatDateTime(value);
}

/** "27 minutes", "1 hour 5 minutes", "45 seconds" — for countdowns. */
export function formatCountdown(untilMs: number): string {
  if (untilMs <= 0) return "0 seconds";
  const duration = moment.duration(untilMs);

  const parts: string[] = [];
  const days = Math.floor(duration.asDays());
  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (duration.hours()) parts.push(`${duration.hours()} ${duration.hours() === 1 ? "hour" : "hours"}`);
  if (duration.minutes() && parts.length < 2) {
    parts.push(`${duration.minutes()} ${duration.minutes() === 1 ? "minute" : "minutes"}`);
  }
  if (!parts.length) {
    const seconds = Math.max(1, duration.seconds());
    parts.push(`${seconds} ${seconds === 1 ? "second" : "seconds"}`);
  }
  return parts.join(" ");
}

/** "12 minutes late" */
export function formatLateness(minutes: number): string {
  if (!minutes) return "on time";
  return `${formatCountdown(minutes * 60_000)} late`;
}

/**
 * The virtual clock, ticking. Polls the server (which owns the offset), then
 * advances locally each second so countdowns move smoothly between polls.
 */
export function useVirtualClock(pollMs = 15_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  const sync = useCallback(async () => {
    try {
      const res = await fetch("/api/clock", { cache: "no-store" });
      const data = await res.json();
      setNow(new Date(data.now));
    } catch {
      // A failed poll should not freeze the countdowns; the local tick carries on.
    }
  }, []);

  useEffect(() => {
    sync();
    const poll = setInterval(sync, pollMs);
    const tick = setInterval(() => {
      setNow((previous) => (previous ? new Date(previous.getTime() + 1000) : previous));
    }, 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [sync, pollMs]);

  return now;
}
