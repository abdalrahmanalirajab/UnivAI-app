export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return "Name must be between 2 and 80 characters.";
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