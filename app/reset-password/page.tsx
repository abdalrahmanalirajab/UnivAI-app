"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthCard from "@/app/components/AuthCard";
import { FormError } from "@/app/components/FormAlerts";
import PasswordField from "@/app/components/PasswordField";
import Button from "@mui/material/Button";
import Link from "next/link";
import {
  validatePassword,
  validateConfirmPassword,
} from "@/lib/validators";
import { authClient } from "@/lib/auth-client";
import { copyFor, type AuthError } from "@/lib/errorMap";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);

  const canSubmit =
    !submitting &&
    validatePassword(newPassword) === null &&
    validateConfirmPassword(newPassword, confirmPassword) === null;

  const handleSubmit = async () => {
    setSubmitting(true);
    setTopLevelError(null);
    setTokenExpired(false);

    const { data, error } = await authClient.resetPassword({
      newPassword,
      token,
    });

    if (error) {
      if (error.code === "INVALID_TOKEN" || error.code === "TOKEN_EXPIRED") {
        setTokenExpired(true);
      } else {
        setTopLevelError(copyFor(error as AuthError).message);
      }
      setSubmitting(false);
      return;
    }

    router.push("/login?reset=1");
  };

  return (
    <AuthCard title="Set a new password">
      <FormError message={topLevelError} />
      {tokenExpired && (
        <Button component={Link} href="/forgot-password" fullWidth>
          Request a new link
        </Button>
      )}
      <PasswordField
        label="New password"
        name="newPassword"
        fullWidth
        required
        margin="normal"
        value={newPassword}
        onChange={(e) => {
          setNewPassword(e.target.value);
          setNewPasswordError(validatePassword(e.target.value));
        }}
        error={newPasswordError !== null}
        helperText={newPasswordError}
      />
      <PasswordField
        label="Confirm password"
        name="confirmPassword"
        fullWidth
        required
        margin="normal"
        value={confirmPassword}
        onChange={(e) => {
          setConfirmPassword(e.target.value);
          setConfirmPasswordError(
            validateConfirmPassword(newPassword, e.target.value)
          );
        }}
        error={confirmPasswordError !== null}
        helperText={confirmPasswordError}
      />
      <Button variant="contained" fullWidth disabled={!canSubmit} onClick={handleSubmit}>
        Reset password
      </Button>
    </AuthCard>
  );
}