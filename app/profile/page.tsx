"use client";

import { useSession } from "@/lib/auth-client";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";

export default function ProfilePage() {
  const { data: session } = useSession();

  if (!session) return null;

  const { user } = session;

  return (
    <>
      <Typography>Email: {user.email}</Typography>
      <Typography>Role: {user.role}</Typography>
      <Typography>Student ID: {user.studentId}</Typography>
      <Divider />
    </>
  );
}