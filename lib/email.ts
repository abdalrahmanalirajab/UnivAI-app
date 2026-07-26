import { env } from "./env";

/**
 * Transactional email for auth (reset + verification links).
 *
 * Production uses Resend (set RESEND_API_KEY). With no key we fall back to
 * printing the message — and, crucially, the link — to the server console, so
 * the whole auth flow is testable locally without an email account. Watch the
 * app window; the banner is loud on purpose.
 *
 * We call Resend over plain fetch to avoid pulling in another dependency.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const { to, subject, text } = opts;

  if (!env.RESEND_API_KEY) {
    console.log(
      [
        "",
        "┌─────────────────────────────────────────────────────────────",
        "│  ✉  DEV EMAIL (no RESEND_API_KEY — not actually sent)",
        `│  to:      ${to}`,
        `│  subject: ${subject}`,
        "│  ---",
        ...text.split("\n").map((line) => `│  ${line}`),
        "└─────────────────────────────────────────────────────────────",
        "",
      ].join("\n")
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
  });

  if (!res.ok) {
    // Don't leak the body to the client; surface enough to debug server-side.
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend failed (${res.status}): ${detail.slice(0, 300)}`);
  }
}
