"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthCard from "@/app/components/AuthCard";
import { FormError } from "@/app/components/FormAlerts";
import TextField from "@mui/material/TextField";
import PasswordField from "@/app/components/PasswordField";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Button from "@mui/material/Button";
import Link from "next/link";
import { validateEmail } from "@/lib/validators";
import { authClient } from "@/lib/auth-client";
import { copyFor, type AuthError } from "@/lib/errorMap";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");

  const canSubmit = validateEmail(email) === null && password.length > 0 && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    setTopLevelError(null);
    setEmailNotVerified(false);

    const { data, error } = await authClient.signIn.email({
      email,
      password,
      rememberMe,
    });

    if (error) {
      const mapped = copyFor(error as AuthError);
      setTopLevelError(mapped.message);
      if (error.code === "EMAIL_NOT_VERIFIED") {
        setEmailNotVerified(true);
      }
      setSubmitting(false);
      return;
    }

    router.push(redirectParam || "/dashboard");
  };

  return (
    <AuthCard title="Log in">
      <FormError message={topLevelError} />
      {emailNotVerified && (
        <Button component={Link} href={`/verify-email?email=${encodeURIComponent(email)}`} fullWidth>
          Verify email
        </Button>
      )}
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
      <PasswordField
        label="Password"
        name="password"
        fullWidth
        required
        margin="normal"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
        }
        label="Remember me"
      />
      <Button variant="contained" fullWidth disabled={!canSubmit} onClick={handleSubmit}>
        Log in
      </Button>
      <Button component={Link} href="/register" fullWidth>
        Don&apos;t have an account? Sign up
      </Button>
      <Button component={Link} href="/forgot-password" fullWidth>
        Forgot password?
      </Button>
    </AuthCard>
  );
}