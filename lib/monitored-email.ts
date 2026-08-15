import "server-only";

import { pool, queryOne } from "./db";
import { submitEmail, type EmailDeliveryOutcome } from "./email";
import type { NotificationCategory } from "./notification-types";

type MonitoredEmailInput = {
  userId: string;
  category: NotificationCategory;
  eventType: string;
  to: string;
  subject: string;
  text: string;
  idempotencyKey?: string;
  terminalPreview?: boolean;
};

type Delivery = (input: {
  to: string;
  subject: string;
  text: string;
  idempotencyKey?: string;
  terminalPreview?: boolean;
}) => Promise<EmailDeliveryOutcome | void>;

function safeInline(value: string, maximum: number, label: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
  if (!cleaned) throw new Error(`${label} is required.`);
  return cleaned;
}

function safeErrorLabel(error: unknown): string {
  const name = error instanceof Error ? error.name.replace(/[^a-zA-Z0-9_-]/g, "") : "UnknownError";
  return `Email delivery failed (${name || "Error"}).`;
}

/**
 * Send a time-critical email immediately while recording delivery metadata.
 * Recipient, body, one-time URLs, provider response, and secrets are never
 * written to the monitoring table.
 */
export async function sendMonitoredEmail(
  input: MonitoredEmailInput,
  deliver?: Delivery,
): Promise<EmailDeliveryOutcome> {
  const eventType = safeInline(input.eventType, 80, "eventType");
  if (!/^[a-z][a-z0-9._-]{0,79}$/.test(eventType)) {
    throw new Error("eventType is invalid.");
  }
  const subject = safeInline(input.subject, 180, "subject");
  let deliveryId: string | null = null;

  try {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO notification_email_delivery_log
         (user_id, category, event_type, subject, status, attempts)
       VALUES ($1::uuid, $2, $3, $4, 'queued', 0)
       RETURNING id::text AS id`,
      [input.userId, input.category, eventType, subject],
    );
    deliveryId = row?.id ?? null;
  } catch {
    // Authentication and account-safety mail must not be blocked solely by a
    // monitoring write. Keep the log message free of recipient/body details.
    console.error("[notifications] could not create direct email delivery metadata.");
  }

  try {
    const options = {
      to: input.to,
      subject,
      text: input.text,
      idempotencyKey: input.idempotencyKey,
      terminalPreview: input.terminalPreview,
    };
    const receipt = deliver
      ? {
          outcome: ((await deliver(options)) ?? "sent") === "sent" ? "submitted" as const : "skipped" as const,
          providerMessageId: null,
        }
      : await submitEmail(options);
    const outcome: EmailDeliveryOutcome = receipt.outcome === "submitted" ? "sent" : "skipped";
    if (deliveryId) {
      try {
        await pool.query(
          `UPDATE notification_email_delivery_log
              SET status = $2,
                  attempts = CASE WHEN $2 = 'submitted' THEN 1 ELSE 0 END,
                  sent_at = CASE WHEN $2 = 'submitted' THEN CURRENT_TIMESTAMP ELSE NULL END,
                  provider_message_id = $3,
                  last_error = NULL,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $1::uuid AND status = 'queued'`,
          [deliveryId, receipt.outcome, receipt.providerMessageId],
        );
      } catch {
        // The email was already delivered (or intentionally skipped). A
        // metadata-only monitoring failure must not break the auth action.
        console.error("[notifications] could not update direct email delivery metadata.");
      }
    }
    return outcome;
  } catch (error) {
    if (deliveryId) {
      try {
        await pool.query(
          `UPDATE notification_email_delivery_log
              SET status = 'failed', attempts = 1, last_error = $2,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $1::uuid AND status = 'queued'`,
          [deliveryId, safeErrorLabel(error)],
        );
      } catch {
        console.error("[notifications] could not update direct email delivery metadata.");
      }
    }
    throw error;
  }
}
