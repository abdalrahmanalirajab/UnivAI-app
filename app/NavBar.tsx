"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Link from "next/link";
import Avatar from "@mui/material/Avatar";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { useSession, signOut } from "@/lib/auth-client";

const ALL_LINKS = [
  { href: "/upload", label: "Books" },
  { href: "/schedule", label: "Schedule" },
  { href: "/exams", label: "Exams" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/admin", label: "Admin" },
];

const STUDENT_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/schedule", label: "Schedule" },
  { href: "/upload", label: "Upload" },
];

export default function NavBar() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const menuOpen = Boolean(anchorEl);

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

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
          <Stack direction="row" spacing={1} alignItems="center">
            {!user ? (
              <>
                <Button color="inherit" component={Link} href="/login">
                  Login
                </Button>
                <Button color="inherit" component={Link} href="/register">
                  Register
                </Button>
              </>
            ) : user.role === "student" ? (
              <>
                {STUDENT_LINKS.map((link) => (
                  <Button
                    key={link.href}
                    color="inherit"
                    component={Link}
                    href={link.href}
                  >
                    {link.label}
                  </Button>
                ))}
                <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
                  <Avatar>{user.name?.charAt(0)?.toUpperCase()}</Avatar>
                </IconButton>
                <Menu
                  anchorEl={anchorEl}
                  open={menuOpen}
                  onClose={() => setAnchorEl(null)}
                >
                  <MenuItem disabled>
                    <Stack>
                      <Typography variant="body1">{user.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {user.studentId}
                      </Typography>
                    </Stack>
                  </MenuItem>
                  <MenuItem
                    component={Link}
                    href="/profile"
                    onClick={() => setAnchorEl(null)}
                  >
                    Profile
                  </MenuItem>
                  <MenuItem onClick={handleLogout}>Logout</MenuItem>
                </Menu>
              </>
            ) : (
              ALL_LINKS.map((link) => (
                <Button
                  key={link.href}
                  color="inherit"
                  component={Link}
                  href={link.href}
                >
                  {link.label}
                </Button>
              ))
            )}
          </Stack>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
