import { env } from "./env";

/**
 * Transactional email for auth (reset + verification links).
 *
 * Production uses Resend (set RESEND_API_KEY). With no key, delivery is skipped
 * without printing the recipient, message, or one-time auth links to logs.
 *
 * We call Resend over plain fetch to avoid pulling in another dependency.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  /** Stable per message; Resend deduplicates retries for 24 hours. */
  idempotencyKey?: string;
  /** Durable jobs must fail and retry rather than pretending a skipped send succeeded. */
  requireDelivery?: boolean;
}): Promise<void> {
  const { to, subject, text, idempotencyKey, requireDelivery = false } = opts;

  if (
    idempotencyKey &&
    (idempotencyKey.length > 256 || !/^[\x21-\x7e]+$/.test(idempotencyKey))
  ) {
    throw new Error("Email idempotency key is invalid.");
  }

  if (!env.RESEND_API_KEY) {
    if (requireDelivery) throw new Error("Email provider is not configured.");
    console.info("[email:dev] Delivery skipped because RESEND_API_KEY is not configured.");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
  });

  if (!res.ok) {
    // Provider bodies may echo recipient details; never put them in errors/logs.
    throw new Error(`Email provider request failed (${res.status}).`);
  }
}
