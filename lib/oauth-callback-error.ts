export function googleOAuthCallbackErrorMessage(error: string | null): string | null {
  if (!error) return null;
  const normalized = error.replaceAll("_", " ").toLowerCase();
  if (
    normalized.includes("eula") ||
    normalized.includes("privacy notice") ||
    normalized.includes("legal acceptance")
  ) {
    return "A new Google account requires acceptance of the current EULA and Privacy Notice. Please try Google again and complete both agreements.";
  }
  return "Google sign-in could not be completed. Please try again.";
}
