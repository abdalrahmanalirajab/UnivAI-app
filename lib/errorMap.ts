// Matches Better Auth's real error shape: code/message are optional and there
// may be extra fields (statusText) we ignore. Kept loose so any auth call's
// error object is assignable.
export type AuthError = { code?: string; message?: string; status: number };

export const ERROR_COPY: Record<string, { field?: "email" | "password"; message: string }> = {
  USER_ALREADY_EXISTS: { field: "email", message: "An account with this email already exists." },
  CANNOT_CHANGE_SUPER_ADMIN_ROLE: { message: "A super admin's role cannot be changed." },
  CANNOT_BAN_SUPER_ADMIN: { message: "A super admin cannot be banned." },
  INVALID_EMAIL: { field: "email", message: "Enter a valid email address." },
  PASSWORD_TOO_SHORT: { field: "password", message: "Password must be at least 8 characters." },
  INVALID_EMAIL_OR_PASSWORD: { message: "Incorrect email or password." },
  EMAIL_NOT_VERIFIED: { message: "Please verify your email first." },
  // Better Auth's admin plugin throws this code (not USER_BANNED) when a banned
  // user tries to sign in; the ban reason is emailed separately (see auth-notify).
  BANNED_USER: {
    message:
      "Your account has been suspended. Check your email for the reason and next steps.",
  },
  INVALID_TOKEN: { message: "This link is invalid or expired." },
  TOKEN_EXPIRED: { message: "This link is invalid or expired." },
  INVALID_PASSWORD: { field: "password", message: "Current password is incorrect." },
};

export function copyFor(err: AuthError): { field?: "email" | "password"; message: string } {
  if (err.status === 429) return { message: "Too many attempts. Please wait a moment." };
  const copy = err.code ? ERROR_COPY[err.code] : undefined;
  return copy ?? { message: "Something went wrong, please try again." };
}