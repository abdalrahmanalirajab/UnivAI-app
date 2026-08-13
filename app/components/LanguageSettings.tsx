"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { UiLocale } from "@/lib/legal-documents";

export default function LanguageSettings({ initialLocale }: { initialLocale: UiLocale }) {
  const [locale, setLocale] = useState<UiLocale>(initialLocale);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/preferences/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not save the application language.");
      window.localStorage.setItem("univai-ui-locale", locale);
      // A full navigation rebuilds the Emotion cache with the correct RTL/LTR
      // plugin and updates server-rendered html lang/dir without a mixed frame.
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the application language.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={1.5} component="section" aria-labelledby="language-settings-title">
      <Typography variant="h5" component="h2" id="language-settings-title">
        Application language
      </Typography>
      <TextField
        select
        label="Website interface language"
        value={locale}
        onChange={(event) => setLocale(event.target.value as UiLocale)}
        helperText="This preference lives in settings, not the navigation bar. Generated learning and exam content always remains English."
      >
        <MenuItem value="en">English</MenuItem>
        <MenuItem value="ar">العربية</MenuItem>
      </TextField>
      <Button variant="contained" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save language"}
      </Button>
      {error ? <Alert severity="error">{error}</Alert> : null}
    </Stack>
  );
}
