import { describe, expect, it } from "vitest";
import {
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

  it("lands prepared learners on one focused Today page", () => {
    const ready = state({ emailVerified: true, hasPreparedSource: true });
    expect(getStartDestination(ready)).toBe("/dashboard");
    expect(getStudentNavItems(ready).map((item) => item.label)).toEqual([
      "Today",
      "Course",
      "Books",
    ]);
  });

  it("keeps the same simple navigation while verification is pending", () => {
    const unverified = state({ hasPreparedSource: true });
    expect(getStudentNavItems(unverified).map((item) => item.label)).toEqual([
      "Today",
      "Course",
      "Books",
    ]);
  });
});
