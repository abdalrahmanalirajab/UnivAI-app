"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import SvgIcon from "@mui/material/SvgIcon";
import Typography from "@mui/material/Typography";
import LegalAcceptanceFields from "@/app/components/LegalAcceptanceFields";
import {
  CURRENT_EULA_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  type UiLocale,
} from "@/lib/legal-documents";

export type LegalAttestation = {
  eulaAccepted: boolean;
  eulaVersion: string;
  privacyNoticeAcknowledged: boolean;
  privacyNoticeVersion: string;
  uiLocale: UiLocale;
};

/**
 * "Continue with Google" for /login and /register — the same control on both,
 * because to Google they are one action: an account is created on first use and
 * signed into afterwards.
 *
 * Always rendered. Whether Google is configured lives in the campus-root .env,
 * which the bundler never sees, so the button cannot be hidden reliably from
 * the client — and hiding it server-side made the feature invisible rather than
 * obviously unconfigured. An unconfigured server says so when the button is
 * pressed instead.
 */

function GoogleMark() {
  return (
    <SvgIcon viewBox="0 0 48 48" sx={{ fontSize: 20 }}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </SvgIcon>
  );
}

export default function GoogleSignInButton({
  callbackURL = "/start",
  errorCallbackURL = "/login",
  onError,
  onLegalRequired,
  disabled = false,
  legalAttestation,
}: {
  /** Where Google returns the learner once the account exists. */
  callbackURL?: string;
  /** Friendly page used when Google returns an OAuth callback error. */
  errorCallbackURL?: string;
  onError?: (message: string) => void;
  onLegalRequired?: () => void;
  disabled?: boolean;
  /** Required on the registration page; login keeps this absent. */
  legalAttestation?: LegalAttestation;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentLocale, setConsentLocale] = useState<UiLocale>("en");
  const [agreedToEula, setAgreedToEula] = useState(false);
  const [acknowledgedPrivacy, setAcknowledgedPrivacy] = useState(false);
  const [showConsentErrors, setShowConsentErrors] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const continueWithGoogle = async (attestation: LegalAttestation) => {
    if (!attestation.eulaAccepted || !attestation.privacyNoticeAcknowledged) {
      onLegalRequired?.();
      onError?.("Both agreements are required to continue with Google.");
      return;
    }
    setSubmitting(true);
    onError?.("");
    setConsentError(null);
    try {
      const acceptance = await fetch("/api/legal/preaccept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attestation),
      });
      const acceptanceBody = await acceptance.json().catch(() => null);
      if (!acceptance.ok) {
        const message = acceptanceBody?.error ??
          "Accept the EULA and acknowledge the Privacy Notice before continuing with Google.";
        setConsentError(message);
        onError?.(message);
        setSubmitting(false);
        return;
      }
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL,
        errorCallbackURL,
      });
      // A successful call navigates away to Google, so reaching this line with
      // an error means the redirect never started. The common cause by far is a
      // server with no GOOGLE_CLIENT_ID/SECRET, which Better Auth reports as an
      // unknown provider — say that plainly rather than "try again", which
      // would never work.
      if (error) {
        const message =
          "Google sign-in is not available on this server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then restart it.";
        setConsentError(message);
        onError?.(message);
        setSubmitting(false);
      }
    } catch {
      const message = "Google sign-in could not be started. Please try again.";
      setConsentError(message);
      onError?.(message);
      setSubmitting(false);
    }
  };

  const start = () => {
    if (legalAttestation) {
      void continueWithGoogle(legalAttestation);
      return;
    }
    setConsentLocale(document.documentElement.lang === "ar" ? "ar" : "en");
    setShowConsentErrors(false);
    setConsentError(null);
    setConsentOpen(true);
  };

  const acceptAndContinue = () => {
    if (!agreedToEula || !acknowledgedPrivacy) {
      setShowConsentErrors(true);
      const targetId = !agreedToEula ? "google-consent-eula" : "google-consent-privacy";
      window.requestAnimationFrame(() => document.getElementById(targetId)?.focus());
      return;
    }
    void continueWithGoogle({
      eulaAccepted: true,
      eulaVersion: CURRENT_EULA_VERSION,
      privacyNoticeAcknowledged: true,
      privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      uiLocale: consentLocale,
    });
  };

  return (
    <Stack spacing={1} sx={{ width: "100%" }}>
      <Divider sx={{ my: 1 }}>or</Divider>
      <Button
        variant="outlined"
        fullWidth
        disabled={disabled || submitting}
        startIcon={<GoogleMark />}
        onClick={start}
      >
        Continue with Google
      </Button>
      <Dialog
        open={consentOpen}
        onClose={() => {
          if (!submitting) setConsentOpen(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Continue safely with Google</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography>
              Google sign-in creates a UnivAI account when this email is new. Both agreements are
              required before that account can be created.
            </Typography>
            {consentError ? <Alert severity="error">{consentError}</Alert> : null}
            <LegalAcceptanceFields
              idPrefix="google-consent"
              uiLocale={consentLocale}
              agreedToEula={agreedToEula}
              acknowledgedPrivacy={acknowledgedPrivacy}
              showErrors={showConsentErrors}
              disabled={submitting}
              onEulaChange={(checked) => {
                setAgreedToEula(checked);
                if (checked && acknowledgedPrivacy) setShowConsentErrors(false);
              }}
              onPrivacyChange={(checked) => {
                setAcknowledgedPrivacy(checked);
                if (checked && agreedToEula) setShowConsentErrors(false);
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConsentOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="contained" onClick={acceptAndContinue} disabled={submitting}>
            Accept and continue with Google
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
