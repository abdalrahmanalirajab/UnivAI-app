"use client";

import { useState } from "react";
import AuthCard from "@/app/components/AuthCard";
import { FormError } from "@/app/components/FormAlerts";
import TextField from "@mui/material/TextField";
import PasswordField from "@/app/components/PasswordField";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Button from "@mui/material/Button";
import Link from "next/link";
import { validateEmail } from "@/lib/validators";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const canSubmit = validateEmail(email) === null && password.length > 0;

  return (
    <AuthCard title="Log in">
      <FormError message={null} />
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
      <Button variant="contained" fullWidth disabled={!canSubmit}>
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