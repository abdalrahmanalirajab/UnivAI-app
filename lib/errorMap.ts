export type AuthError = { code: string; message: string; status: number };

export const ERROR_COPY: Record<string, { field?: "email" | "password"; message: string }> = {
  USER_ALREADY_EXISTS: { field: "email", message: "An account with this email already exists." },
  INVALID_EMAIL: { field: "email", message: "Enter a valid email address." },
  PASSWORD_TOO_SHORT: { field: "password", message: "Password must be at least 8 characters." },
  INVALID_EMAIL_OR_PASSWORD: { message: "Incorrect email or password." },
  EMAIL_NOT_VERIFIED: { message: "Please verify your email first." },
  USER_BANNED: { message: "This account is suspended." },
  INVALID_TOKEN: { message: "This link is invalid or expired." },
  TOKEN_EXPIRED: { message: "This link is invalid or expired." },
  INVALID_PASSWORD: { field: "password", message: "Current password is incorrect." },
};

export function copyFor(err: AuthError): { field?: "email" | "password"; message: string } {
  if (err.status === 429) return { message: "Too many attempts. Please wait a moment." };
  return ERROR_COPY[err.code] ?? { message: "Something went wrong, please try again." };
}