"use client";

import { useSearchParams } from "next/navigation";
import AuthCard from "@/app/components/AuthCard";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

  return (
    <AuthCard title="Check your email">
      <Typography>
        We sent a verification link to {email}. Click it to activate your account.
      </Typography>
      <Button variant="contained" fullWidth>
        Resend email
      </Button>
    </AuthCard>
  );
}