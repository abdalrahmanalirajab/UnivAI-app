"use client";

import { useState } from "react";
import AuthCard from "@/app/components/AuthCard";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import { validateEmail } from "@/lib/validators";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setSubmitted(true);
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <AuthCard title="Reset your password">
        <Alert severity="success">
          If an account exists for that email, we&apos;ve sent a reset link.
        </Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password">
      <TextField
        label="Email"
        name="email"
        fullWidth
        required
        margin="normal"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setEmailError(validateEmail(e.target.value));
        }}
        error={emailError !== null}
        helperText={emailError}
      />
      <Button
        variant="contained"
        fullWidth
        disabled={validateEmail(email) !== null || submitting}
        onClick={handleSubmit}
      >
        Send reset link
      </Button>
    </AuthCard>
  );
}