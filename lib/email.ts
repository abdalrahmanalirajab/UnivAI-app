import { env } from "./env";

export type EmailDeliveryOutcome = "sent" | "skipped";

function printEmailToTerminal(to: string, subject: string, text: string): void {
  console.log(
    [
      "",
      "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
      "!!!  UNIVAI AUTH EMAIL - COPY THE LINK BELOW             !!!",
      "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
      `TO: ${to}`,
      `SUBJECT: ${subject}`,
      "------------------------------------------------------------",
      text,
      "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
      "",
    ].join("\n"),
  );
}

/**
 * Transactional email for auth (reset + verification links).
 *
 * Production uses Resend (set RESEND_API_KEY). Without a key, the complete
 * message is printed so one-time auth links remain usable from the terminal.
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
  /** Auth links remain visible in the server terminal even when delivery succeeds. */
  terminalPreview?: boolean;
}): Promise<EmailDeliveryOutcome> {
  const {
    to,
    subject,
    text,
    idempotencyKey,
    requireDelivery = false,
    terminalPreview = false,
  } = opts;

  if (
    idempotencyKey &&
    (idempotencyKey.length > 256 || !/^[\x21-\x7e]+$/.test(idempotencyKey))
  ) {
    throw new Error("Email idempotency key is invalid.");
  }

  if (terminalPreview) printEmailToTerminal(to, subject, text);

  if (!env.RESEND_API_KEY) {
    if (requireDelivery) throw new Error("Email provider is not configured.");
    if (!terminalPreview) printEmailToTerminal(to, subject, text);
    return "skipped";
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
  return "sent";
}
