import { NextRequest } from "next/server";
import {
  now,
  getOffsetMs,
  setNow,
  advanceMs,
  resetClock,
  HOUR_MS,
  DAY_MS,
  WEEK_MS,
  MINUTE_MS,
} from "@/lib/clock";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [virtualNow, offsetMs] = await Promise.all([now(), getOffsetMs()]);
  return Response.json({ now: virtualNow.toISOString(), offsetMs });
}

/**
 * Admin clock control. Body: { action, ... }
 *   { action: "set", iso: "2026-08-01T10:00:00Z" }
 *   { action: "advance", ms: 3600000 }  |  { action: "advance", hours|days|weeks|minutes: N }
 *   { action: "jumpToNextLecture" }     → lands exactly on the next lecture's start
 *   { action: "reset" }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = body?.action as string | undefined;

  switch (action) {
    case "set": {
      if (!body.iso) return Response.json({ error: "iso is required" }, { status: 400 });
      const target = new Date(body.iso);
      if (Number.isNaN(target.getTime()))
        return Response.json({ error: "invalid iso date" }, { status: 400 });
      const virtualNow = await setNow(target);
      return Response.json({ now: virtualNow.toISOString(), offsetMs: await getOffsetMs() });
    }

    case "advance": {
      const delta =
        Number(body.ms ?? 0) +
        Number(body.minutes ?? 0) * MINUTE_MS +
        Number(body.hours ?? 0) * HOUR_MS +
        Number(body.days ?? 0) * DAY_MS +
        Number(body.weeks ?? 0) * WEEK_MS;
      if (!delta) return Response.json({ error: "no delta given" }, { status: 400 });
      const virtualNow = await advanceMs(delta);
      return Response.json({ now: virtualNow.toISOString(), offsetMs: await getOffsetMs() });
    }

    case "jumpToNextLecture": {
      const current = await now();
      const next = await queryOne<{ starts_at: Date }>(
        "SELECT starts_at FROM lectures WHERE starts_at > $1 ORDER BY starts_at ASC LIMIT 1",
        [current]
      );
      if (!next)
        return Response.json({ error: "no upcoming lecture" }, { status: 404 });
      const virtualNow = await setNow(new Date(next.starts_at));
      return Response.json({ now: virtualNow.toISOString(), offsetMs: await getOffsetMs() });
    }

    case "reset": {
      const virtualNow = await resetClock();
      return Response.json({ now: virtualNow.toISOString(), offsetMs: 0 });
    }

    default:
      return Response.json(
        { error: "action must be one of: set | advance | jumpToNextLecture | reset" },
        { status: 400 }
      );
  }
}
