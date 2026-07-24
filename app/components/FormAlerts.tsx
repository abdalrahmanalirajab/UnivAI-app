"use client";

import Alert from "@mui/material/Alert";

export function FormError({ message }: { message: string | null }) {
  if (message === null) return null;
  return <Alert severity="error">{message}</Alert>;
}

export function FormSuccess({ message }: { message: string | null }) {
  if (message === null) return null;
  return <Alert severity="success">{message}</Alert>;
}