export type OnboardingState = {
  emailVerified: boolean;
  hasPreparedSource: boolean;
};

export type StudentNavItem = {
  href: string;
  label: string;
  icon: "upload" | "schedule" | "library" | "dashboard";
};

export function getStartDestination(state: OnboardingState): "/upload" | "/dashboard" {
  return state.hasPreparedSource ? "/dashboard" : "/upload";
}

export function getStudentNavItems(state: OnboardingState): StudentNavItem[] {
  if (!state.hasPreparedSource) {
    return [{ href: "/upload", label: "Upload", icon: "upload" }];
  }

  return [
    { href: "/dashboard", label: "Today", icon: "dashboard" },
    { href: "/schedule", label: "Course", icon: "schedule" },
    { href: "/library", label: "Books", icon: "library" },
  ];
}
