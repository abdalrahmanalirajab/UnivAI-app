"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import { useSession } from "@/lib/auth-client";
import { authClient } from "@/lib/auth-client";
import { useHydratedSession } from "@/lib/use-hydrated-session";
import { FormError, FormSuccess } from "@/app/components/FormAlerts";
import {
  INVALID_USER_NAME_MESSAGE,
  normalizeName,
  normalizePhone,
  validateName,
  validatePhone,
} from "@/lib/validators";

type SessionUser = NonNullable<ReturnType<typeof useSession>["data"]>["user"];

export default function ProfilePage() {
  const { data: session } = useHydratedSession();

  if (!session) return null;

  return <ProfileForm user={session.user} />;
}

function ProfileForm({ user }: { user: SessionUser }) {
  const [name, setName] = useState(user.name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const canSave = validateName(name) === null && validatePhone(phone) === null;

  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(false);
    const normalizedName = normalizeName(name);
    const invalidName = validateName(normalizedName);
    if (invalidName) {
      setNameError(invalidName);
      return;
    }

    const { error } = await authClient.updateUser({
      name: normalizedName,
      phone: normalizePhone(phone),
    });
    if (error) {
      setSaveError(error.message ?? "Could not save changes.");
      return;
    }

    setName(normalizedName);
    setSaveSuccess(true);
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={0.75} component="header">
        <Typography variant="overline" color="primary">Your account</Typography>
        <Typography variant="h2" component="h1">Profile</Typography>
        <Typography color="text.secondary">
          Keep your personal details accurate. Preferences, security, and privacy live in Settings.
        </Typography>
      </Stack>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card variant="outlined">
            <CardContent>
              <Stack spacing={2.5}>
                <Stack spacing={0.5}>
                  <Typography variant="h5" component="h2">Personal information</Typography>
                  <Typography variant="body2" color="text.secondary">
                    This is the information shown on your UnivAI account.
                  </Typography>
                </Stack>
                <TextField
                  label="Name"
                  name="name"
                  fullWidth
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setNameError(validateName(event.target.value));
                    setSaveSuccess(false);
                  }}
                  error={nameError !== null}
                  helperText={nameError ?? INVALID_USER_NAME_MESSAGE}
                />
                <TextField
                  label="Phone (optional)"
                  name="phone"
                  fullWidth
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    setPhoneError(validatePhone(event.target.value));
                    setSaveSuccess(false);
                  }}
                  error={phoneError !== null}
                  helperText={phoneError ?? "Used only for account and course support."}
                />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button variant="contained" disabled={!canSave} onClick={handleSave}>
                    Save changes
                  </Button>
                  {saveSuccess ? <FormSuccess message="Profile updated." /> : null}
                </Stack>
                {saveError ? <FormError message={saveError} /> : null}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined">
            <CardContent>
              <Stack spacing={2} className="align-start">
                <Avatar>{name.charAt(0).toUpperCase()}</Avatar>
                <Stack spacing={0.25}>
                  <Typography variant="h5">{name || "UnivAI learner"}</Typography>
                  <Typography variant="body2" color="text.secondary">{user.email}</Typography>
                </Stack>
                <Chip label={(user.role ?? "student").replaceAll("_", " ")} size="small" color="primary" variant="outlined" />
                <Divider flexItem />
                <Stack spacing={0.25}>
                  <Typography variant="caption" color="text.secondary">Registration number</Typography>
                  <Typography>{user.registrationNumber}</Typography>
                </Stack>
                <Button
                  component={Link}
                  href="/settings"
                  variant="outlined"
                  startIcon={<SettingsOutlined />}
                  fullWidth
                >
                  Open settings
                </Button>
                {user.role === "student" ? (
                  <Button
                    component={Link}
                    href="/absences"
                    variant="text"
                    startIcon={<FactCheckOutlined />}
                    fullWidth
                  >
                    Attendance &amp; appeal history
                  </Button>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
