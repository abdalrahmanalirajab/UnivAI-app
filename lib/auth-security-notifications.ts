import { randomUUID } from "node:crypto";

import { enqueueEmailNotification } from "./notification-outbox";

type AuthAfterContext = {
  path: string;
  body?: { revokeOtherSessions?: boolean };
  context: {
    session?: { user?: { id?: string } } | null;
    returned?: unknown;
  };
};

/** Queue security mail only after Better Auth completed a sensitive action. */
export async function queueAuthSecurityNotification(ctx: unknown): Promise<void> {
  const event = ctx as AuthAfterContext;
  const userId = event.context.session?.user?.id;
  if (!userId || event.context.returned === undefined) return;

  const notification =
    event.path === "/change-password"
      ? ({ type: "security.password_changed" } as const)
      : event.path === "/revoke-other-sessions" || event.path === "/revoke-sessions"
        ? ({ type: "security.sessions_revoked" } as const)
        : null;
  if (!notification) return;

  try {
    await enqueueEmailNotification({
      userId,
      eventId: `auth:${event.path}:${randomUUID()}`,
      event: notification,
    });
  } catch (error) {
    const label = error instanceof Error ? error.name : "UnknownError";
    console.error(`[notifications] could not queue security email (${label})`);
  }
}
