import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { signUp: { email: vi.fn() } },
}));
vi.mock("@/app/components/GoogleSignInButton", () => ({
  default: () => <button type="button">Continue with Google</button>,
}));

import RegisterPage from "@/app/register/page";

describe("registration page", () => {
  it("creates a Free account without showing payment plans", () => {
    render(<RegisterPage />);

    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText("Choose your plan")).toBeNull();
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
  });

  it("explains and validates the two required agreements instead of silently disabling signup", async () => {
    render(<RegisterPage />);

    const createAccount = screen.getByRole("button", { name: "Create account" });
    expect(createAccount.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("Accept both required agreements to continue.")).toBeTruthy();

    fireEvent.click(createAccount);

    expect(await screen.findByText("EULA acceptance is required.")).toBeTruthy();
    expect(screen.getByText("Privacy Notice acknowledgment is required.")).toBeTruthy();
  });
});
