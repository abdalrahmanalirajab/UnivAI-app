"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import AuthCard from "@/app/components/AuthCard";
import { useHydratedSession } from "@/lib/use-hydrated-session";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "your email address";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const { data: session, isPending } = useHydratedSession();
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user.emailVerified) {
      router.replace("/subscribe");
      router.refresh();
    }
  }, [router, session?.user.emailVerified]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((current) => current - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError(null);
    const response = await fetch("/api/verification/resend", { method: "POST" });
    if (!response.ok) {
      setError("Could not send the verification email. Please try again.");
      return;
    }
    setCooldown(30);
  };

  if (isPending) return null;

  if (!session?.user) {
    return (
      <AuthCard title="Verify your email">
        <Alert severity="info">Log in to resend your private verification link.</Alert>
        <Button component={Link} href="/login" variant="contained" fullWidth>
          Log in
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Check your email">
      <Typography>
        We sent a private verification link to {maskEmail(session.user.email)}. You
        are still logged in and can continue setting up your account.
      </Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Button
        variant="contained"
        fullWidth
        disabled={cooldown > 0}
        onClick={handleResend}
      >
        {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
      </Button>
      <Button component={Link} href="/subscribe" fullWidth>
        Continue to memberships
      </Button>
    </AuthCard>
  );
}
