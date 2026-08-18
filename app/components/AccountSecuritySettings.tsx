"use client";

import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { authClient } from "@/lib/auth-client";
import { copyFor } from "@/lib/errorMap";
import { FormError, FormSuccess } from "@/app/components/FormAlerts";
import PasswordField from "@/app/components/PasswordField";
import { validatePassword } from "@/lib/validators";

type SessionRecord = {
  id?: string;
  token?: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt?: string | Date;
  current?: boolean;
};

export default function AccountSecuritySettings({ email }: { email: string }) {
  const [newEmail, setNewEmail] = useState("");
  const [changeEmailError, setChangeEmailError] = useState<string | null>(null);
  const [changeEmailSuccess, setChangeEmailSuccess] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [confirmNewPasswordError, setConfirmNewPasswordError] = useState<string | null>(null);
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(false);
  const [changePasswordSuccess, setChangePasswordSuccess] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const loadSessions = async () => {
    const result = await authClient.listSessions();
    if (result.error) {
      setSessionError(result.error.message ?? "Could not load active sessions.");
      setSessions([]);
      return;
    }
    setSessions(result.data ?? []);
    setSessionError(null);
  };

  useEffect(() => {
    void loadSessions();
  }, []);

  const handleEmailChange = async () => {
    setChangeEmailError(null);
    setChangeEmailSuccess(null);
    const requestedEmail = newEmail.trim();
    const { error } = await authClient.changeEmail({
      newEmail: requestedEmail,
      callbackURL: "/settings#security",
    });
    if (error) {
      setChangeEmailError(
        error.code ? copyFor(error).message : error.message ?? "Could not change email.",
      );
      return;
    }
    setChangeEmailSuccess(
      `Verification sent to ${requestedEmail}. Your email changes after you open the link.`,
    );
    setNewEmail("");
  };

  const handlePasswordChange = async () => {
    setChangePasswordError(null);
    setChangePasswordSuccess(false);
    setCurrentPasswordError(null);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions,
    });
    if (error) {
      if (error.code === "INVALID_PASSWORD") {
        setCurrentPasswordError(copyFor(error).message);
      } else {
        setChangePasswordError(copyFor(error).message);
      }
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setRevokeOtherSessions(false);
    setChangePasswordSuccess(true);
    await loadSessions();
  };

  const handleRevokeOthers = async () => {
    setSessionNotice(null);
    setSessionError(null);
    const result = await authClient.revokeOtherSessions();
    if (result.error) {
      setSessionError(result.error.message ?? "Could not sign out the other devices.");
      return;
    }
    setSessionNotice("All other devices have been signed out.");
    await loadSessions();
  };

  return (
    <Stack spacing={2.5}>
      <Stack spacing={0.5}>
        <Typography variant="h4" component="h2">Account &amp; security</Typography>
        <Typography color="text.secondary">
          Manage how you sign in and review the devices using your account.
        </Typography>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="h6" component="h3">Email address</Typography>
              <Typography variant="body2" color="text.secondary">
                Your current sign-in email is {email}.
              </Typography>
            </Stack>
            <Stack spacing={1} className="align-start">
              <TextField
                label="New email"
                name="newEmail"
                fullWidth
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                helperText="We will send a verification link before changing it."
              />
              <Button variant="contained" disabled={!newEmail.trim()} onClick={handleEmailChange}>
                Change email
              </Button>
            </Stack>
            {changeEmailSuccess ? <FormSuccess message={changeEmailSuccess} /> : null}
            {changeEmailError ? <FormError message={changeEmailError} /> : null}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="h6" component="h3">Password</Typography>
              <Typography variant="body2" color="text.secondary">
                Use a strong password you do not use on another website.
              </Typography>
            </Stack>
            <PasswordField
              label="Current password"
              name="currentPassword"
              fullWidth
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                setCurrentPasswordError(null);
              }}
              error={currentPasswordError !== null}
              helperText={currentPasswordError}
            />
            <PasswordField
              label="New password"
              name="newPassword"
              fullWidth
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setNewPasswordError(validatePassword(event.target.value));
              }}
              error={newPasswordError !== null}
              helperText={newPasswordError}
            />
            <PasswordField
              label="Confirm new password"
              name="confirmNewPassword"
              fullWidth
              value={confirmNewPassword}
              onChange={(event) => {
                setConfirmNewPassword(event.target.value);
                setConfirmNewPasswordError(
                  event.target.value !== newPassword ? "Passwords do not match." : null,
                );
              }}
              error={confirmNewPasswordError !== null}
              helperText={confirmNewPasswordError}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={revokeOtherSessions}
                  onChange={(event) => setRevokeOtherSessions(event.target.checked)}
                />
              }
              label="Log out of other devices after changing my password"
            />
            <Button
              variant="contained"
              disabled={
                !currentPassword ||
                validatePassword(newPassword) !== null ||
                confirmNewPassword !== newPassword
              }
              onClick={handlePasswordChange}
            >
              Change password
            </Button>
            {changePasswordSuccess ? <FormSuccess message="Password changed." /> : null}
            {changePasswordError ? <FormError message={changePasswordError} /> : null}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="h6" component="h3">Signed-in devices</Typography>
              <Typography variant="body2" color="text.secondary">
                If you do not recognize a device, sign out the others and change your password.
              </Typography>
            </Stack>
            {sessionNotice ? <Alert severity="success" onClose={() => setSessionNotice(null)}>{sessionNotice}</Alert> : null}
            {sessionError ? <Alert severity="error">{sessionError}</Alert> : null}
            {sessions === null ? (
              <Typography color="text.secondary">Loading devices…</Typography>
            ) : sessions.length === 0 ? (
              <Typography color="text.secondary">No active devices found.</Typography>
            ) : (
              <List disablePadding>
                {sessions.map((session, index) => (
                  <ListItem
                    key={
                      session.id ??
                      session.token ??
                      (session.createdAt ? new Date(session.createdAt).toISOString() : index)
                    }
                    divider={index < sessions.length - 1}
                    disableGutters
                  >
                    <ListItemText
                      primary={session.userAgent ?? "Unknown device"}
                      secondary={[
                        session.ipAddress,
                        session.createdAt ? new Date(session.createdAt).toLocaleString() : null,
                      ].filter(Boolean).join(" · ")}
                    />
                    {session.current ? <Chip label="This device" size="small" /> : null}
                  </ListItem>
                ))}
              </List>
            )}
            <Button variant="outlined" color="error" onClick={handleRevokeOthers}>
              Sign out all other devices
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
