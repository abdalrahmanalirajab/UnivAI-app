"use client";

import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";

type Category = "course" | "lecture" | "assessment" | "transcript";
type Preferences = Record<Category, boolean>;

const LABELS: Record<Category, string> = {
  course: "Course ready or needs attention",
  lecture: "Lecture reminders",
  assessment: "Quiz and exam results",
  transcript: "Final transcript ready",
};

export default function NotificationPreferences() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/notifications/preferences", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load email settings.");
        return response.json() as Promise<{ preferences: Preferences }>;
      })
      .then((body) => {
        if (active) setPreferences(body.preferences);
      })
      .catch(() => {
        if (active) setError("Could not load email settings.");
      });
    return () => {
      active = false;
    };
  }, []);

  const update = async (category: Category, enabled: boolean) => {
    if (!preferences || saving) return;
    const previous = preferences;
    setPreferences({ ...preferences, [category]: enabled });
    setSaving(category);
    setError(null);
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: { [category]: enabled } }),
      });
      if (!response.ok) throw new Error("Could not save email settings.");
      const body = (await response.json()) as { preferences: Preferences };
      setPreferences(body.preferences);
    } catch {
      setPreferences(previous);
      setError("Could not save email settings.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2} aria-busy={!preferences || Boolean(saving)}>
          <Stack spacing={0.5}>
            <Typography variant="h6">Email notifications</Typography>
            <Typography variant="body2" color="text.secondary">
              Choose learning updates. Security and billing alerts always stay on.
            </Typography>
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
          {!preferences ? (
            <CircularProgress size={24} aria-label="Loading email settings" />
          ) : (
            <FormGroup>
              {(Object.keys(LABELS) as Category[]).map((category) => (
                <FormControlLabel
                  key={category}
                  control={
                    <Switch
                      checked={preferences[category]}
                      disabled={Boolean(saving)}
                      onChange={(event) => void update(category, event.target.checked)}
                      slotProps={{ input: { "aria-label": LABELS[category] } }}
                    />
                  }
                  label={LABELS[category]}
                />
              ))}
            </FormGroup>
          )}
          <Typography variant="caption" color="text.secondary">
            Password, session, payment, and membership changes are always emailed for your safety.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
