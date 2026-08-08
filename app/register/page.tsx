"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthCard from "@/app/components/AuthCard";
import { FormError } from "@/app/components/FormAlerts";
import TextField from "@mui/material/TextField";
import PasswordField from "@/app/components/PasswordField";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Button from "@mui/material/Button";
import {
  validateName,
  validateEmail,
  validatePhone,
  validatePassword,
  validateConfirmPassword,
  normalizePhone,
} from "@/lib/validators";
import { authClient } from "@/lib/auth-client";
import { copyFor, type AuthError } from "@/lib/errorMap";
import GoogleSignInButton from "@/app/components/GoogleSignInButton";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  // Empty, not "+20": the field is optional now, and a dialling prefix on its
  // own is not a valid number — it would block the form for anyone who simply
  // left the phone blank.
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const router = useRouter();

  const canSubmit =
    agreedToTerms &&
    !submitting &&
    validateName(name) === null &&
    validateEmail(email) === null &&
    validatePhone(phone) === null &&
    validatePassword(password) === null &&
    validateConfirmPassword(password, confirmPassword) === null;

  const handleSubmit = async () => {
    setSubmitting(true);
    setTopLevelError(null);
    setNameError(null);
    setEmailError(null);
    setPhoneError(null);
    setPasswordError(null);
    setConfirmPasswordError(null);

    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
      // "" would be stored as an empty string beside the NULLs that mean the
      // same thing; send the absence itself.
      phone: normalizePhone(phone),
      callbackURL: "/start",
    });

    if (error) {
      const mapped = copyFor(error as AuthError);
      if (mapped.field === "email") {
        setEmailError(mapped.message);
      } else if (mapped.field === "password") {
        setPasswordError(mapped.message);
      } else {
        setTopLevelError(mapped.message);
      }
      setSubmitting(false);
      return;
    }

    router.push("/start");
    router.refresh();
  };

  return (
    <AuthCard title="Create your account">
      <FormError message={topLevelError} />
      <TextField
        label="Name"
        name="name"
        fullWidth
        required
        margin="normal"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setNameError(validateName(e.target.value));
        }}
        error={nameError !== null}
        helperText={nameError}
      />
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
      <TextField
        label="Phone (optional)"
        name="phone"
        fullWidth
        margin="normal"
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value);
          setPhoneError(validatePhone(e.target.value));
        }}
        error={phoneError !== null}
        helperText={phoneError ?? "You can add this later on your profile."}
      />
      <PasswordField
        label="Password"
        name="password"
        fullWidth
        required
        margin="normal"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setPasswordError(validatePassword(e.target.value));
        }}
        error={passwordError !== null}
        helperText={passwordError}
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
          setConfirmPasswordError(validateConfirmPassword(password, e.target.value));
        }}
        error={confirmPasswordError !== null}
        helperText={confirmPasswordError}
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
          />
        }
        label="I agree to the terms"
      />
      <Button variant="contained" fullWidth disabled={!canSubmit} onClick={handleSubmit}>
        Create account
      </Button>
      <GoogleSignInButton
        onError={(message) => setTopLevelError(message || null)}
      />
    </AuthCard>
  );
}
