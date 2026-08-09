import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import {
  dispatchEmailNotifications,
  enqueueCourseBuildNotifications,
  enqueueDueLectureReminders,
} from "@/lib/notification-outbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function configuredSecret(): string {
  // A dedicated deployment secret is preferred. BETTER_AUTH_SECRET keeps local
  // and self-hosted installs secure without a second mandatory secret.
  return (env.NOTIFICATION_DISPATCH_SECRET || env.BETTER_AUTH_SECRET).trim();
}

function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !supplied) return false;
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export async function POST(request: Request) {
  const secret = configuredSecret();
  if (secret.length < 24) {
    return Response.json({ error: "Notification dispatcher is not configured." }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [courseUpdatesQueued, remindersQueued] = await Promise.all([
    enqueueCourseBuildNotifications(),
    enqueueDueLectureReminders(),
  ]);
  const result = await dispatchEmailNotifications();
  return Response.json(
    { courseUpdatesQueued, remindersQueued, ...result },
    { headers: { "Cache-Control": "no-store" } },
  );
}
