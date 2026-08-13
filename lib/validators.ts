const USER_NAME_PATTERN =
  /^\p{L}[\p{L}\p{Mn}\p{Mc}]*(?: \p{L}[\p{L}\p{Mn}\p{Mc}]*)*$/u;
const NAME_VARIATION_SELECTOR = /[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/u;

export const INVALID_USER_NAME_MESSAGE =
  "Use letters from any language and spaces only. Numbers, symbols, and emoji are not allowed.";

/** Store one canonical separator while preserving letters from every script. */
export function normalizeName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/gu, " ");
}

/**
 * A word starts with a Unicode letter and may contain combining marks needed
 * by scripts such as Devanagari or decomposed accents. Only ordinary spaces
 * may separate words; digits, punctuation, symbols and emoji never match.
 */
export function hasOnlyNameLetters(name: string): boolean {
  const normalized = normalizeName(name);
  return !NAME_VARIATION_SELECTOR.test(normalized) && USER_NAME_PATTERN.test(normalized);
}

export function validateName(name: string): string | null {
  const normalized = normalizeName(name);
  const length = Array.from(normalized).length;
  if (normalized && !hasOnlyNameLetters(normalized)) return INVALID_USER_NAME_MESSAGE;
  if (length < 2 || length > 80) return "Name must be between 2 and 80 characters.";
  return null;
}

export function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  return null;
}

/**
 * Optional. A learner may register without a phone number — Google sign-in
 * supplies none, so requiring it on one route and not the other would only
 * describe how the account was created. A number that IS given still has to be
 * a plausible E.164 one.
 */
export function validatePhone(phone: string): string | null {
  if (phone.trim() === "") return null;
  if (!/^\+\d{8,15}$/.test(phone)) return "Enter a valid phone number (e.g. +201234567890).";
  return null;
}

/**
 * The one place "" and null stop being two ways to say the same thing.
 *
 * Forms hand back "" for an untouched field and Google sends nothing at all;
 * both mean the learner has not given a number, and the column stores that as
 * NULL. Used on the way in (auth create hook) and on the way out (profile save).
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  const trimmed = (phone ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8 || password.length > 128) return "Password must be between 8 and 128 characters.";
  return null;
}

export function validateConfirmPassword(password: string, confirm: string): string | null {
  if (password !== confirm) return "Passwords do not match.";
  return null;
}
