"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AppBar from "@mui/material/AppBar";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import AccountCircleOutlined from "@mui/icons-material/AccountCircleOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import FolderCopyOutlined from "@mui/icons-material/FolderCopyOutlined";
import LoginOutlined from "@mui/icons-material/LoginOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import MenuOutlined from "@mui/icons-material/MenuOutlined";
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import UploadFileOutlined from "@mui/icons-material/UploadFileOutlined";
import TollOutlined from "@mui/icons-material/TollOutlined";
import PrivacyTipOutlined from "@mui/icons-material/PrivacyTipOutlined";
import ThemeModeMenu from "./ThemeModeMenu";
import BrandMark from "./components/BrandMark";
import { useHydratedSession } from "@/lib/use-hydrated-session";
import { useSignOut } from "@/lib/use-sign-out";
import { getStudentNavItems } from "@/lib/onboarding-flow";
import { useOnboarding } from "./OnboardingProvider";
import CreditBalance from "./components/CreditBalance";

type NavItem = {
  href: string;
  label: string;
  icon?: typeof MenuBookOutlined;
};

const PUBLIC_LINKS: NavItem[] = [
  { href: "/#how-it-works", label: "Why UnivAI" },
  { href: "/#live-preview", label: "Preview" },
  { href: "/#for-graduates", label: "For fresh graduates" },
  { href: "/#faq", label: "Questions" },
];

const STUDENT_ICONS = {
  upload: UploadFileOutlined,
  schedule: EventOutlined,
  library: FolderCopyOutlined,
  dashboard: DashboardOutlined,
} as const;

export default function NavBar() {
  const theme = useTheme();
  const pathname = usePathname();
  const { data: session } = useHydratedSession();
  const { state: onboarding } = useOnboarding();
  const user = session?.user;
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { performSignOut, signingOut, error: signOutFailed } = useSignOut();
  const [signOutError, setSignOutError] = useState(false);
  const menuOpen = Boolean(anchorEl);

  useEffect(() => {
    if (signOutFailed) setSignOutError(true);
  }, [signOutFailed]);

  const handleLogout = () => {
    setAnchorEl(null);
    setDrawerOpen(false);
    void performSignOut();
  };

  const navLinks = (): NavItem[] => {
    if (!user) return PUBLIC_LINKS;

    const studentLinks: NavItem[] = onboarding
      ? getStudentNavItems(onboarding).map((item) => ({
          href: item.href,
          label: item.label,
          icon: STUDENT_ICONS[item.icon],
        }))
      : [];

    switch (user.role) {
      case "admin":
        return [
          { href: "/admin", label: "Admin", icon: SettingsOutlined },
          { href: "/admin/privacy", label: "Privacy requests", icon: PrivacyTipOutlined },
        ];
      case "super_admin":
        return [
          { href: "/admin", label: "Admin", icon: SettingsOutlined },
          { href: "/admin/privacy", label: "Privacy requests", icon: PrivacyTipOutlined },
          {
            href: "/admin/users",
            label: "Users",
            icon: AccountCircleOutlined,
          },
        ];
      default:
        return studentLinks;
    }
  };

  const isActive = (href: string) => {
    if (href.startsWith("/#")) return false;
    const path = href.split("#")[0] || "/";
    if (path === "/") return pathname === "/";
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  const links = navLinks();

  return (
    <AppBar position="sticky" elevation={0}>
      <Toolbar>
        <Container maxWidth="xl" disableGutters>
          <Stack direction="row" className="nav-shell">
            <Button component={Link} href="/" className="brand-link">
              <Stack direction="row" spacing={1} className="align-center">
                <BrandMark />
                <Stack className="align-start">
                  <Typography variant="h6" component="span">
                    UnivAI
                  </Typography>
                  <Typography variant="caption" className="brand-tagline">
                    Clearer learning
                  </Typography>
                </Stack>
              </Stack>
            </Button>

            <Stack direction="row" spacing={0.5} className="desktop-nav nav-links">
              {links.map((link) => (
                <Button
                  key={link.href}
                  color="inherit"
                  component={Link}
                  href={link.href}
                  className={isActive(link.href) ? "nav-link-active" : undefined}
                  aria-current={isActive(link.href) ? "page" : undefined}
                >
                  {link.label}
                </Button>
              ))}
            </Stack>

            <Stack
              direction="row"
              spacing={0.5}
              className="nav-actions align-center"
            >
              <ThemeModeMenu />
              {!user ? (
                <Stack direction="row" spacing={1} className="desktop-nav">
                  <Button color="inherit" component={Link} href="/login">
                    Log in
                  </Button>
                  <Button variant="contained" component={Link} href="/register">
                    Start free
                  </Button>
                </Stack>
              ) : (
                <Stack
                  direction="row"
                  spacing={1}
                  className="desktop-nav align-center"
                >
                  {user.role === "student" ? <CreditBalance /> : null}
                  <Typography variant="body2" color="text.secondary">
                    {user.name}
                  </Typography>
                  <Tooltip title="Account menu">
                    <IconButton
                      aria-label="Open account menu"
                      aria-controls={menuOpen ? "account-menu" : undefined}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen ? "true" : undefined}
                      onClick={(event) => setAnchorEl(event.currentTarget)}
                    >
                      <Avatar>{user.name?.charAt(0)?.toUpperCase()}</Avatar>
                    </IconButton>
                  </Tooltip>
                </Stack>
              )}

              <Tooltip title="Open navigation">
                <IconButton
                  className="mobile-nav-control"
                  aria-label="Open navigation"
                  aria-expanded={drawerOpen}
                  onClick={() => setDrawerOpen(true)}
                >
                  <MenuOutlined />
                </IconButton>
              </Tooltip>

              {user ? (
                <Menu
                  id="account-menu"
                  anchorEl={anchorEl}
                  open={menuOpen}
                  onClose={() => setAnchorEl(null)}
                  slotProps={{ list: { "aria-label": "Account" } }}
                >
                  <MenuItem disabled>
                    <Stack>
                      <Typography variant="body1">{user.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {user.registrationNumber}
                      </Typography>
                    </Stack>
                  </MenuItem>
                  {user.role === "student" ? (
                    <MenuItem
                      component={Link}
                      href="/subscribe"
                      onClick={() => setAnchorEl(null)}
                    >
                      Plan and Credits
                    </MenuItem>
                  ) : null}
                  <MenuItem
                    component={Link}
                    href="/profile"
                    onClick={() => setAnchorEl(null)}
                  >
                    Profile
                  </MenuItem>
                  <MenuItem
                    component={Link}
                    href="/settings"
                    onClick={() => setAnchorEl(null)}
                  >
                    Settings
                  </MenuItem>
                  <MenuItem onClick={handleLogout} disabled={signingOut}>
                    {signingOut ? "Signing out…" : "Sign out"}
                  </MenuItem>
                </Menu>
              ) : null}
            </Stack>
          </Stack>
        </Container>
      </Toolbar>

      <Drawer
        anchor={theme.direction === "rtl" ? "left" : "right"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{ paper: { className: "drawer-paper" } }}
      >
        <Stack
          component="nav"
          aria-label="Mobile navigation"
          spacing={2}
          className="drawer-content"
        >
          <Stack direction="row" className="align-center">
            <Stack direction="row" spacing={1} className="align-center">
              <BrandMark />
              <Typography variant="h6">UnivAI</Typography>
            </Stack>
            <IconButton
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
              className="nav-actions"
            >
              <CloseOutlined />
            </IconButton>
          </Stack>
          <Divider />
          <List aria-label="Primary navigation">
            {links.map((link) => {
              const LinkIcon = link.icon ?? MenuBookOutlined;
              return (
                <ListItemButton
                  key={link.href}
                  component={Link}
                  href={link.href}
                  selected={isActive(link.href)}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  onClick={() => setDrawerOpen(false)}
                >
                  <ListItemIcon>
                    <LinkIcon />
                  </ListItemIcon>
                  <ListItemText primary={link.label} />
                </ListItemButton>
              );
            })}
          </List>
          <Divider />
          {user ? (
            <Stack spacing={1}>
              <Typography variant="overline" color="text.secondary">
                Signed in as
              </Typography>
              <Typography variant="subtitle1">{user.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {user.registrationNumber}
              </Typography>
              {user.role === "student" ? (
                <>
                  <CreditBalance />
                  <Button
                    variant="outlined"
                    component={Link}
                    href="/subscribe"
                    startIcon={<TollOutlined />}
                    onClick={() => setDrawerOpen(false)}
                  >
                    Plan and Credits
                  </Button>
                </>
              ) : null}
              <Button
                variant="outlined"
                component={Link}
                href="/profile"
                startIcon={<AccountCircleOutlined />}
                onClick={() => setDrawerOpen(false)}
              >
                Profile
              </Button>
              <Button
                variant="outlined"
                component={Link}
                href="/settings"
                startIcon={<SettingsOutlined />}
                onClick={() => setDrawerOpen(false)}
              >
                Settings
              </Button>
              <Button
                color="error"
                startIcon={<LogoutOutlined />}
                disabled={signingOut}
                onClick={handleLogout}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </Button>
            </Stack>
          ) : (
            <Stack spacing={1}>
              <Button
                variant="outlined"
                component={Link}
                href="/login"
                startIcon={<LoginOutlined />}
                onClick={() => setDrawerOpen(false)}
              >
                Log in
              </Button>
              <Button
                variant="contained"
                component={Link}
                href="/register"
                onClick={() => setDrawerOpen(false)}
              >
                Start free
              </Button>
            </Stack>
          )}
        </Stack>
      </Drawer>

      <Snackbar
        open={signOutError}
        autoHideDuration={6000}
        onClose={() => setSignOutError(false)}
      >
        <Alert severity="error" onClose={() => setSignOutError(false)}>
          Could not sign out. Please try again.
        </Alert>
      </Snackbar>
    </AppBar>
  );
}
