"use client";

import Link from "next/link";
import Alert from "@mui/material/Alert";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { UiLocale } from "@/lib/legal-documents";

type Props = {
  idPrefix: string;
  uiLocale: UiLocale;
  agreedToEula: boolean;
  acknowledgedPrivacy: boolean;
  showErrors?: boolean;
  disabled?: boolean;
  onEulaChange: (checked: boolean) => void;
  onPrivacyChange: (checked: boolean) => void;
};

export default function LegalAcceptanceFields({
  idPrefix,
  uiLocale,
  agreedToEula,
  acknowledgedPrivacy,
  showErrors = false,
  disabled = false,
  onEulaChange,
  onPrivacyChange,
}: Props) {
  const complete = agreedToEula && acknowledgedPrivacy;
  const eulaError = showErrors && !agreedToEula;
  const privacyError = showErrors && !acknowledgedPrivacy;

  return (
    <Stack spacing={1}>
      <Alert severity={!complete && showErrors ? "error" : "info"}>
        {complete
          ? "Both required agreements are accepted."
          : "Accept both required agreements to continue."}
      </Alert>
      <FormControl error={eulaError} required disabled={disabled}>
        <FormControlLabel
          control={
            <Checkbox
              id={`${idPrefix}-eula`}
              checked={agreedToEula}
              onChange={(event) => onEulaChange(event.target.checked)}
              required
              slotProps={{
                input: {
                  "aria-describedby": eulaError ? `${idPrefix}-eula-error` : undefined,
                },
              }}
            />
          }
          label={
            <Typography variant="body2">
              I have read and accept the current{" "}
              <Link href={`/legal/eula?lang=${uiLocale}`} target="_blank">
                EULA and Content Use Agreement
              </Link>
              . I confirm that I am responsible for having the right to use materials I upload.
            </Typography>
          }
        />
        {eulaError ? (
          <FormHelperText id={`${idPrefix}-eula-error`}>
            EULA acceptance is required.
          </FormHelperText>
        ) : null}
      </FormControl>
      <FormControl error={privacyError} required disabled={disabled}>
        <FormControlLabel
          control={
            <Checkbox
              id={`${idPrefix}-privacy`}
              checked={acknowledgedPrivacy}
              onChange={(event) => onPrivacyChange(event.target.checked)}
              required
              slotProps={{
                input: {
                  "aria-describedby": privacyError ? `${idPrefix}-privacy-error` : undefined,
                },
              }}
            />
          }
          label={
            <Typography variant="body2">
              I have read the{" "}
              <Link href={`/legal/privacy?lang=${uiLocale}`} target="_blank">
                Privacy Notice
              </Link>
              . This acknowledgment is separate from optional consent choices.
            </Typography>
          }
        />
        {privacyError ? (
          <FormHelperText id={`${idPrefix}-privacy-error`}>
            Privacy Notice acknowledgment is required.
          </FormHelperText>
        ) : null}
      </FormControl>
    </Stack>
  );
}
