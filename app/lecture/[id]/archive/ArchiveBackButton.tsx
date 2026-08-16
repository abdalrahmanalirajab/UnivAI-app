"use client";

import Link from "next/link";
import Button from "@mui/material/Button";

export default function ArchiveBackButton() {
  return (
    <Button component={Link} href="/schedule">
      Back to schedule
    </Button>
  );
}
