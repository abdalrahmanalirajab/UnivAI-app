export type OnboardingState = {
  emailVerified: boolean;
  hasPreparedSource: boolean;
};

export type StudentNavItem = {
  href: string;
  label: string;
  icon: "upload" | "schedule" | "library" | "dashboard" | "exams";
};

export const ONBOARDING_STEPS = [
  { id: "verify", label: "Verify email" },
  { id: "upload", label: "Upload books" },
  { id: "schedule", label: "Follow schedule" },
  { id: "exams", label: "Take exams" },
] as const;

export function getStartDestination(state: OnboardingState): "/upload" | "/schedule" {
  return state.hasPreparedSource ? "/schedule" : "/upload";
}

export function getActiveOnboardingStep(state: OnboardingState): number {
  if (!state.emailVerified) return 0;
  if (!state.hasPreparedSource) return 1;
  return 2;
}

export function getStudentNavItems(state: OnboardingState): StudentNavItem[] {
  if (!state.hasPreparedSource) {
    return [{ href: "/upload", label: "Upload", icon: "upload" }];
  }

  return [
    { href: "/schedule", label: "Schedule", icon: "schedule" },
    { href: "/library", label: "Library", icon: "library" },
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    ...(state.emailVerified
      ? [{ href: "/exams", label: "Exams", icon: "exams" } as const]
      : []),
  ];
}
