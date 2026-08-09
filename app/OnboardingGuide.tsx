"use client";

import { usePathname } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Link from "next/link";
import { useHydratedSession } from "@/lib/use-hydrated-session";
import { useOnboarding } from "./OnboardingProvider";

const HIDDEN_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
]);

export default function OnboardingGuide() {
  const pathname = usePathname();
  const { data: session } = useHydratedSession();
  const { state } = useOnboarding();

  if (!session?.user || !state || HIDDEN_PATHS.has(pathname) || pathname.startsWith("/admin")) {
    return null;
  }

  if (state.emailVerified && (state.hasPreparedSource || pathname === "/upload")) {
    return null;
  }

  return (
    <Container maxWidth="xl" className="onboarding-shell">
      {!state.emailVerified ? (
        <Alert
          severity="warning"
          action={
            pathname === "/verify-email" ? null : (
              <Button color="inherit" component={Link} href="/verify-email" size="small">
                Verify email
              </Button>
            )
          }
        >
          Verify your email before joining a live lecture or taking an assessment.
        </Alert>
      ) : (
        <Alert
          severity="info"
          action={
            <Button color="inherit" component={Link} href="/upload" size="small">
              Choose a book
            </Button>
          }
        >
          Choose a book to create your course.
        </Alert>
      )}
    </Container>
  );
}
