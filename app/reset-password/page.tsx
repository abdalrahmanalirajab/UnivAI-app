"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthCard from "@/app/components/AuthCard";
import { FormError } from "@/app/components/FormAlerts";
import PasswordField from "@/app/components/PasswordField";
import Button from "@mui/material/Button";
import {
  validatePassword,
  validateConfirmPassword,
} from "@/lib/validators";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);

  const canSubmit =
    validatePassword(newPassword) === null &&
    validateConfirmPassword(newPassword, confirmPassword) === null;

  return (
    <AuthCard title="Set a new password">
      <FormError message={null} />
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
      <Button variant="contained" fullWidth disabled={!canSubmit}>
        Reset password
      </Button>
    </AuthCard>
  );
}