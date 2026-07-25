"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import AuthCard from "@/app/components/AuthCard";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { authClient } from "@/lib/auth-client";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0) return;
    await authClient.sendVerificationEmail({
      email,
      callbackURL: "/login?verified=1",
    });
    setCooldown(30);
  };

  return (
    <AuthCard title="Check your email">
      <Typography>
        We sent a verification link to {email}. Click it to activate your account.
      </Typography>
      <Button
        variant="contained"
        fullWidth
        disabled={cooldown > 0}
        onClick={handleResend}
      >
        {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
      </Button>
    </AuthCard>
  );
}