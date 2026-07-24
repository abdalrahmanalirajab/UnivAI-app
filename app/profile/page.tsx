"use client";

import { useState } from "react";
import { useSession } from "@/lib/auth-client";
import { authClient } from "@/lib/auth-client";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import { FormError, FormSuccess } from "@/app/components/FormAlerts";
import { validateName, validatePhone } from "@/lib/validators";

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
    </>
  );
}