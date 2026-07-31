"use client";

import { usePathname } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Container from "@mui/material/Container";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import {
  getActiveOnboardingStep,
  ONBOARDING_STEPS,
} from "@/lib/onboarding-flow";
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

  const activeStep = getActiveOnboardingStep(state);

  return (
    <Container maxWidth="xl" className="onboarding-shell">
      <Stack spacing={1.5}>
        {!state.emailVerified ? (
          <Alert
            severity="warning"
            action={
              pathname === "/verify-email" ? null : (
                <Button color="inherit" component={Link} href="/verify-email" size="small">
                  Verify now
                </Button>
              )
            }
          >
            Verify your email before joining lectures or taking exams. You can keep
            setting up your learning space now.
          </Alert>
        ) : null}

        <Card variant="outlined">
          <Stack spacing={1.5} className="onboarding-guide">
            <Typography variant="subtitle2">Your learning path</Typography>
            <Stepper activeStep={activeStep} alternativeLabel>
              {ONBOARDING_STEPS.map((step, index) => (
                <Step
                  key={step.id}
                  completed={
                    step.id === "verify"
                      ? state.emailVerified
                      : step.id === "upload"
                        ? state.hasPreparedSource
                        : index < activeStep
                  }
                >
                  <StepLabel>{step.label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
