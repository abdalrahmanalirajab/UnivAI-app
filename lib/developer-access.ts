import "server-only";

import { env } from "./env";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse the server-only CSV allowlist once, consistently and case-insensitively. */
export function parseDeveloperEmails(csv: string | null | undefined): string[] {
  return [...new Set(
    (csv ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => EMAIL_PATTERN.test(email))
  )];
}

export function isDeveloperEmail(
  email: string | null | undefined,
  csv = env.DEVELOPER_EMAILS
): boolean {
  if (!email) return false;
  return parseDeveloperEmails(csv).includes(email.trim().toLowerCase());
}
