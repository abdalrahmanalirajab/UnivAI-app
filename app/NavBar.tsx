"use client";

import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Link from "next/link";

const LINKS = [
  { href: "/upload", label: "Books" },
  { href: "/schedule", label: "Schedule" },
  { href: "/exams", label: "Exams" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/admin", label: "Admin" },
];

export default function NavBar() {
  return (
    <AppBar position="static">
      <Toolbar>
        <Stack
          direction="row"
          spacing={2}
          divider={<Divider orientation="vertical" flexItem />}
        >
          <Typography variant="h6" component="div">
            UnivAI
          </Typography>
          <Stack direction="row" spacing={1}>
            {LINKS.map((link) => (
              <Button
                key={link.href}
                color="inherit"
                component={Link}
                href={link.href}
              >
                {link.label}
              </Button>
            ))}
          </Stack>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
