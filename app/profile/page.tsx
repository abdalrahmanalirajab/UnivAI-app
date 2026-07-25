"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { authClient } from "@/lib/auth-client";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import { FormError, FormSuccess } from "@/app/components/FormAlerts";
import { validateName, validatePhone, validatePassword } from "@/lib/validators";
import PasswordField from "@/app/components/PasswordField";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import { copyFor } from "@/lib/errorMap";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Chip from "@mui/material/Chip";

export default function ProfilePage() {
  const { data: session } = useSession();

  if (!session) return null;

  const { user } = session;

  const [name, setName] = useState(user.name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
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
  const [sessions, setSessions] = useState<unknown[]>([]);

  useEffect(() => {
    authClient.listSessions().then((res) => setSessions(res.data ?? []));
  }, []);

  const handleRevokeOthers = async () => {
    await authClient.revokeOtherSessions();
    const res = await authClient.listSessions();
    setSessions(res.data ?? []);
  };

  const canSave = validateName(name) === null && validatePhone(phone) === null;

  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(false);
    const { error } = await authClient.updateUser({ name, phone });
    if (error) {
      setSaveError(error.message);
    } else {
      setSaveSuccess(true);
    }
  };

  return (
    <>
      <Typography>Email: {user.email}</Typography>
      <Typography>Role: {user.role}</Typography>
      <Typography>Student ID: {user.studentId}</Typography>
      <Divider />
      <TextField
        label="Name"
        name="name"
        fullWidth
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
        label="Phone"
        name="phone"
        fullWidth
        margin="normal"
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value);
          setPhoneError(validatePhone(e.target.value));
        }}
        error={phoneError !== null}
        helperText={phoneError}
      />
      <Button variant="contained" disabled={!canSave} onClick={handleSave}>
        Save
      </Button>
      {saveSuccess && <FormSuccess message="Saved" />}
      {saveError && <FormError message={saveError} />}
      <Divider />
      <Typography>Change email</Typography>
      <TextField
        label="New email"
        name="newEmail"
        fullWidth
        margin="normal"
        value={newEmail}
        onChange={(e) => setNewEmail(e.target.value)}
      />
      <Button
        variant="contained"
        onClick={async () => {
          setChangeEmailError(null);
          setChangeEmailSuccess(null);
          const { error } = await authClient.changeEmail({
            newEmail,
            callbackURL: "/profile?email_changed=1",
          });
          if (error) {
            setChangeEmailError(error.message);
          } else {
            setChangeEmailSuccess(
              `Verification sent to ${newEmail}. Your email will update once you click the link.`
            );
          }
        }}
      >
        Change email
      </Button>
      {changeEmailSuccess && <FormSuccess message={changeEmailSuccess} />}
      {changeEmailError && <FormError message={changeEmailError} />}
      <Divider />
      <Typography>Change password</Typography>
      <PasswordField
        label="Current password"
        name="currentPassword"
        fullWidth
        margin="normal"
        value={currentPassword}
        onChange={(e) => {
          setCurrentPassword(e.target.value);
          setCurrentPasswordError(null);
        }}
        error={currentPasswordError !== null}
        helperText={currentPasswordError}
      />
      <PasswordField
        label="New password"
        name="newPassword"
        fullWidth
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
        label="Confirm new password"
        name="confirmNewPassword"
        fullWidth
        margin="normal"
        value={confirmNewPassword}
        onChange={(e) => {
          setConfirmNewPassword(e.target.value);
          setConfirmNewPasswordError(
            e.target.value !== newPassword ? "Passwords do not match." : null
          );
        }}
        error={confirmNewPasswordError !== null}
        helperText={confirmNewPasswordError}
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={revokeOtherSessions}
            onChange={(e) => setRevokeOtherSessions(e.target.checked)}
          />
        }
        label="Log out of other devices"
      />
      <Button
        variant="contained"
        disabled={
          !currentPassword ||
          validatePassword(newPassword) !== null ||
          confirmNewPassword !== newPassword
        }
        onClick={async () => {
          setChangePasswordError(null);
          setChangePasswordSuccess(false);
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
          } else {
            setCurrentPassword("");
            setNewPassword("");
            setConfirmNewPassword("");
            setChangePasswordSuccess(true);
          }
        }}
      >
        Change password
      </Button>
      {changePasswordSuccess && <FormSuccess message="Password changed." />}
      {changePasswordError && <FormError message={changePasswordError} />}
      <Divider />
      <Typography>Active sessions</Typography>
      <List>
        {sessions.map((s: unknown) => {
          const session = s as { userAgent?: string; createdAt?: string; current?: boolean };
          return (
            <ListItem key={session.createdAt}>
              <ListItemText
                primary={session.userAgent ?? "Unknown"}
                secondary={
                  session.createdAt
                    ? new Date(session.createdAt).toLocaleString()
                    : undefined
                }
              />
              {session.current && <Chip label="This device" size="small" />}
            </ListItem>
          );
        })}
      </List>
      <Button variant="contained" onClick={handleRevokeOthers}>
        Log out of all other devices
      </Button>
    </>
  );
}