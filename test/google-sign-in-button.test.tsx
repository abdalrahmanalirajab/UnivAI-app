import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  social: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { social: mocks.social } },
}));

import GoogleSignInButton from "@/app/components/GoogleSignInButton";
import {
  CURRENT_EULA_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
} from "@/lib/legal-documents";

describe("Google legal-consent flow", () => {
  beforeEach(() => {
    mocks.social.mockReset();
    mocks.social.mockResolvedValue({ data: {}, error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true, locale: "en" }),
    }));
    document.documentElement.lang = "en";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("collects both agreements before Google can create a new account", async () => {
    render(<GoogleSignInButton callbackURL="/start" errorCallbackURL="/login" />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(mocks.social).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Accept and continue with Google" }));
    expect(await screen.findByText("EULA acceptance is required.")).toBeTruthy();
    expect(screen.getByText("Privacy Notice acknowledgment is required.")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: /EULA and Content Use Agreement/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Privacy Notice/i }));
    fireEvent.click(screen.getByRole("button", { name: "Accept and continue with Google" }));

    await waitFor(() => expect(mocks.social).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(request?.body))).toEqual({
      eulaAccepted: true,
      eulaVersion: CURRENT_EULA_VERSION,
      privacyNoticeAcknowledged: true,
      privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      uiLocale: "en",
    });
    expect(mocks.social).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/start",
      errorCallbackURL: "/login",
    });
  });

  it("returns an incomplete registration-page attestation to its checkboxes", () => {
    const onLegalRequired = vi.fn();
    render(
      <GoogleSignInButton
        legalAttestation={{
          eulaAccepted: false,
          eulaVersion: CURRENT_EULA_VERSION,
          privacyNoticeAcknowledged: false,
          privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
          uiLocale: "en",
        }}
        onLegalRequired={onLegalRequired}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(onLegalRequired).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.social).not.toHaveBeenCalled();
  });
});
