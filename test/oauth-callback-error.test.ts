import { describe, expect, it } from "vitest";
import { googleOAuthCallbackErrorMessage } from "@/lib/oauth-callback-error";

describe("Google OAuth callback errors", () => {
  it("turns the legal-signup rejection into useful registration guidance", () => {
    expect(
      googleOAuthCallbackErrorMessage(
        "Accept_the_current_EULA_and_acknowledge_the_current_Privacy_Notice_before_creating_an_account.",
      ),
    ).toContain("requires acceptance");
  });

  it("does not expose unexpected provider details", () => {
    expect(googleOAuthCallbackErrorMessage("internal_provider_failure")).toBe(
      "Google sign-in could not be completed. Please try again.",
    );
    expect(googleOAuthCallbackErrorMessage(null)).toBeNull();
  });
});
