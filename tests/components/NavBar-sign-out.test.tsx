import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NavBar from "@/app/NavBar";

const mocks = vi.hoisted(() => {
  const router = { push: vi.fn(), replace: vi.fn() };
  const shared = { performSignOut: vi.fn(), signingOut: false, error: false };
  const auth = { signOut: vi.fn() };
  const sessionUser = {
    id: "7",
    name: "Amina",
    registrationNumber: "S-1",
    role: "student",
  };
  return { router, shared, auth, sessionUser };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/schedule",
  useRouter: () => mocks.router,
}));
vi.mock("@/lib/use-sign-out", () => ({ useSignOut: () => mocks.shared }));
vi.mock("@/lib/auth-client", () => ({ signOut: mocks.auth.signOut }));
vi.mock("@/lib/use-hydrated-session", () => ({
  useHydratedSession: () => ({
    data: { user: mocks.sessionUser },
    isPending: false,
  }),
}));
vi.mock("@/app/OnboardingProvider", () => ({
  useOnboarding: () => ({
    state: { emailVerified: true, hasPreparedSource: true },
    loading: false,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/app/ThemeModeMenu", () => ({ default: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionUser.role = "student";
});

describe("NavBar sign-out wiring", () => {
  it("delegates to the shared useSignOut hook from the account menu", async () => {
    const user = userEvent.setup();
    render(<NavBar />);

    await user.click(screen.getByRole("button", { name: "Open account menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    expect(mocks.shared.performSignOut).toHaveBeenCalledTimes(1);
  });

  it("delegates to the shared useSignOut hook from the mobile drawer", async () => {
    const user = userEvent.setup();
    render(<NavBar />);

    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    await user.click(
      screen.getByRole("button", { name: "Sign out" }).closest("button") as HTMLElement,
    );

    expect(mocks.shared.performSignOut).toHaveBeenCalledTimes(1);
  });

  it("no longer signs out directly or redirects with router.push from NavBar", async () => {
    const user = userEvent.setup();
    render(<NavBar />);

    await user.click(screen.getByRole("button", { name: "Open account menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    expect(mocks.auth.signOut).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("shows admins only admin navigation, without learner panels", async () => {
    mocks.sessionUser.role = "admin";
    const user = userEvent.setup();
    render(<NavBar />);

    await user.click(screen.getByRole("button", { name: "Open navigation" }));

    expect(screen.getByRole("link", { name: "Admin" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy requests" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Today" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Course" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Books" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Upload" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Plan and Credits" })).toBeNull();
  });
});
