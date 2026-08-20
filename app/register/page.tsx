"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthCard from "@/app/components/AuthCard";
import { FormError } from "@/app/components/FormAlerts";
import TextField from "@mui/material/TextField";
import PasswordField from "@/app/components/PasswordField";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import {
  validateName,
  validateEmail,
  validatePhone,
  validatePassword,
  validateConfirmPassword,
  INVALID_USER_NAME_MESSAGE,
  normalizeName,
  normalizePhone,
} from "@/lib/validators";
import { authClient } from "@/lib/auth-client";
import { copyFor, type AuthError } from "@/lib/errorMap";
import GoogleSignInButton from "@/app/components/GoogleSignInButton";
import LegalAcceptanceFields from "@/app/components/LegalAcceptanceFields";
import {
  CURRENT_EULA_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  type UiLocale,
} from "@/lib/legal-documents";
import { googleOAuthCallbackErrorMessage } from "@/lib/oauth-callback-error";

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
  const [uiLocale, setUiLocale] = useState<UiLocale>("en");
  const [agreedToEula, setAgreedToEula] = useState(false);
  const [acknowledgedPrivacy, setAcknowledgedPrivacy] = useState(false);
  const [showLegalErrors, setShowLegalErrors] = useState(false);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [localeSaving, setLocaleSaving] = useState(false);

  const router = useRouter();

  useEffect(() => {
    setUiLocale(document.documentElement.lang === "ar" ? "ar" : "en");
    const callbackError = googleOAuthCallbackErrorMessage(
      new URLSearchParams(window.location.search).get("error"),
    );
    if (callbackError) setTopLevelError(callbackError);
  }, []);

  const focusMissingLegalAcceptance = () => {
    const targetId = !agreedToEula ? "registration-eula" : "registration-privacy";
    window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      target?.scrollIntoView?.({ block: "center" });
      target?.focus();
    });
  };

  const handleLocaleChange = async (nextLocale: UiLocale) => {
    const previousLocale = uiLocale;
    setUiLocale(nextLocale);
    setLocaleSaving(true);
    setTopLevelError(null);
    try {
      const response = await fetch("/api/preferences/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error ?? "Could not change the application language.");
      }
      window.localStorage.setItem("univai-ui-locale", nextLocale);
      // The selector is deliberately the first field. A full navigation is
      // required to rebuild both the Emotion RTL cache and the DOM catalog;
      // it also guarantees Arabic-to-English switches do not retain text that
      // the Arabic translator changed after hydration.
      window.location.reload();
    } catch (reason) {
      setUiLocale(previousLocale);
      setTopLevelError(
        reason instanceof Error
          ? reason.message
          : "Could not change the application language.",
      );
    } finally {
      setLocaleSaving(false);
    }
  };

  const handleSubmit = async () => {
    setTopLevelError(null);

    const normalizedName = normalizeName(name);
    const invalidName = validateName(normalizedName);
    const invalidEmail = validateEmail(email);
    const invalidPhone = validatePhone(phone);
    const invalidPassword = validatePassword(password);
    const invalidConfirmation = validateConfirmPassword(password, confirmPassword);
    const missingLegalAcceptance = !agreedToEula || !acknowledgedPrivacy;
    setNameError(invalidName);
    setEmailError(invalidEmail);
    setPhoneError(invalidPhone);
    setPasswordError(invalidPassword);
    setConfirmPasswordError(invalidConfirmation);
    setShowLegalErrors(missingLegalAcceptance);

    if (
      invalidName ||
      invalidEmail ||
      invalidPhone ||
      invalidPassword ||
      invalidConfirmation ||
      missingLegalAcceptance
    ) {
      setTopLevelError(
        missingLegalAcceptance
          ? "Accept both required agreements before creating your account."
          : "Review the highlighted registration fields.",
      );
      if (missingLegalAcceptance) focusMissingLegalAcceptance();
      return;
    }

    setSubmitting(true);

    const legalAttestation = {
      eulaAccepted: true as const,
      eulaVersion: CURRENT_EULA_VERSION,
      privacyNoticeAcknowledged: true as const,
      privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      uiLocale,
    };
    const legalResponse = await fetch("/api/legal/preaccept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(legalAttestation),
    }).catch(() => null);
    if (!legalResponse?.ok) {
      const body = await legalResponse?.json().catch(() => null);
      setTopLevelError(body?.error ?? "Could not record your legal choices. Please try again.");
      setSubmitting(false);
      return;
    }

    const destination = "/subscribe";
    const { error } = await authClient.signUp.email({
      name: normalizedName,
      email,
      password,
      // "" would be stored as an empty string beside the NULLs that mean the
      // same thing; send the absence itself.
      phone: normalizePhone(phone),
      ...legalAttestation,
      callbackURL: destination,
    });

    if (error) {
      const mapped = copyFor(error as AuthError);
      if (mapped.field === "name") {
        setNameError(mapped.message);
      } else if (mapped.field === "email") {
        setEmailError(mapped.message);
      } else if (mapped.field === "password") {
        setPasswordError(mapped.message);
      } else {
        setTopLevelError(mapped.message);
      }
      setSubmitting(false);
      return;
    }

    router.push(destination);
    router.refresh();
  };

  return (
    <AuthCard title="Create your account" maxWidth="sm">
      <FormError message={topLevelError} />
      <TextField
        select
        label="Application language"
        name="uiLocale"
        fullWidth
        margin="normal"
        value={uiLocale}
        disabled={localeSaving || submitting}
        onChange={(event) => void handleLocaleChange(event.target.value as UiLocale)}
        helperText="This changes website controls and labels. Generated content remains in its authored language."
      >
        <MenuItem value="en">English</MenuItem>
        <MenuItem value="ar">العربية</MenuItem>
      </TextField>
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
        helperText={nameError ?? INVALID_USER_NAME_MESSAGE}
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
      <LegalAcceptanceFields
        idPrefix="registration"
        uiLocale={uiLocale}
        agreedToEula={agreedToEula}
        acknowledgedPrivacy={acknowledgedPrivacy}
        showErrors={showLegalErrors}
        disabled={submitting || localeSaving}
        onEulaChange={(checked) => {
          setAgreedToEula(checked);
          if (checked && acknowledgedPrivacy) setShowLegalErrors(false);
        }}
        onPrivacyChange={(checked) => {
          setAcknowledgedPrivacy(checked);
          if (checked && agreedToEula) setShowLegalErrors(false);
        }}
      />
      <Button
        variant="contained"
        fullWidth
        disabled={submitting || localeSaving}
        onClick={handleSubmit}
      >
        Create account
      </Button>
      <GoogleSignInButton
        callbackURL="/start"
        errorCallbackURL="/register"
        disabled={submitting || localeSaving}
        legalAttestation={{
          eulaAccepted: agreedToEula,
          eulaVersion: CURRENT_EULA_VERSION,
          privacyNoticeAcknowledged: acknowledgedPrivacy,
          privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
          uiLocale,
        }}
        onLegalRequired={() => {
          setShowLegalErrors(true);
          focusMissingLegalAcceptance();
        }}
        onError={(message) => setTopLevelError(message || null)}
      />
    </AuthCard>
  );
}
