import { describe, expect, it } from "vitest";
import {
  getActiveOnboardingStep,
  getStartDestination,
  getStudentNavItems,
  type OnboardingState,
} from "@/lib/onboarding-flow";

const state = (overrides: Partial<OnboardingState> = {}): OnboardingState => ({
  emailVerified: false,
  hasPreparedSource: false,
  ...overrides,
});

describe("onboarding flow", () => {
  it("keeps a new student on the upload road", () => {
    expect(getStartDestination(state())).toBe("/upload");
    expect(getStudentNavItems(state())).toEqual([
      { href: "/upload", label: "Upload", icon: "upload" },
    ]);
  });

  it("puts schedule first and removes upload after preparation", () => {
    const ready = state({ emailVerified: true, hasPreparedSource: true });
    expect(getStartDestination(ready)).toBe("/schedule");
    expect(getStudentNavItems(ready).map((item) => item.label)).toEqual([
      "Schedule",
      "Library",
      "Dashboard",
      "Exams",
      "Transcript",
    ]);
  });

  it("keeps exams hidden until email verification", () => {
    const unverified = state({ hasPreparedSource: true });
    expect(getStudentNavItems(unverified).map((item) => item.label)).toEqual([
      "Schedule",
      "Library",
      "Dashboard",
    ]);
    expect(getActiveOnboardingStep(unverified)).toBe(0);
  });
});
