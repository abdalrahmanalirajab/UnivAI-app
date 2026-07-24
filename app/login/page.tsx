"use client";

import AuthCard from "@/app/components/AuthCard";
import { FormError } from "@/app/components/FormAlerts";
import TextField from "@mui/material/TextField";
import PasswordField from "@/app/components/PasswordField";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Button from "@mui/material/Button";
import Link from "next/link";

export default function LoginPage() {
  return (
    <AuthCard title="Log in">
      <FormError message={null} />
      <TextField label="Email" name="email" fullWidth required margin="normal" />
      <PasswordField label="Password" name="password" fullWidth required margin="normal" />
      <FormControlLabel control={<Checkbox />} label="Remember me" />
      <Button variant="contained" fullWidth>
        Log in
      </Button>
      <Button component={Link} href="/register" fullWidth>
        Don&apos;t have an account? Sign up
      </Button>
      <Button component={Link} href="/forgot-password" fullWidth>
        Forgot password?
      </Button>
    </AuthCard>
  );
}