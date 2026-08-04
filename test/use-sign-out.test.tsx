import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSignOut, SIGN_IN_PATH } from "@/lib/use-sign-out";

const mocks = vi.hoisted(() => {
  const router = { replace: vi.fn(), push: vi.fn() };
  const auth = { signOut: vi.fn() };
  return { router, auth };
});

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/lib/auth-client", () => ({ signOut: mocks.auth.signOut }));

function AccountMenuHost() {
  const { performSignOut, signingOut } = useSignOut();
  return (
    <button onClick={() => void performSignOut()} disabled={signingOut}>
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}

function DrawerHost() {
  const { performSignOut } = useSignOut();
  return <button onClick={() => void performSignOut()}>Drawer sign out</button>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.signOut.mockResolvedValue(undefined);
});

describe("useSignOut", () => {
  it("clears the session before replace-navigating", async () => {
    let resolveSignOut: () => void = () => {};
    mocks.auth.signOut.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSignOut = resolve;
      })
    );
    const user = userEvent.setup();
    render(<AccountMenuHost />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(mocks.auth.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.router.replace).not.toHaveBeenCalled();

    resolveSignOut();
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(SIGN_IN_PATH)
    );
  });

  it("navigates with replace, never push", async () => {
    const user = userEvent.setup();
    render(<AccountMenuHost />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(SIGN_IN_PATH)
    );
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("does not navigate when the session cannot be cleared", async () => {
    mocks.auth.signOut.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<AccountMenuHost />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(mocks.auth.signOut).toHaveBeenCalledTimes(1));
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("behaves the same regardless of which caller triggers it", async () => {
    const user = userEvent.setup();
    render(
      <>
        <AccountMenuHost />
        <DrawerHost />
      </>
    );

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await user.click(screen.getByRole("button", { name: "Drawer sign out" }));

    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledTimes(2));
    expect(mocks.auth.signOut).toHaveBeenCalledTimes(2);
    expect(mocks.router.replace).toHaveBeenNthCalledWith(1, SIGN_IN_PATH);
    expect(mocks.router.replace).toHaveBeenNthCalledWith(2, SIGN_IN_PATH);
    expect(mocks.router.push).not.toHaveBeenCalled();
  });
});
