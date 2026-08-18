"use client";

import { useEffect, useState } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import LockOutlined from "@mui/icons-material/LockOutlined";
import PrivacyTipOutlined from "@mui/icons-material/PrivacyTipOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";
import AccountSecuritySettings from "@/app/components/AccountSecuritySettings";
import LanguageSettings from "@/app/components/LanguageSettings";
import NotificationPreferences from "@/app/components/NotificationPreferences";
import PrivacyCenter from "@/app/components/PrivacyCenter";
import { useHydratedSession } from "@/lib/use-hydrated-session";

type SettingsTab = "general" | "security" | "privacy";

const TABS: SettingsTab[] = ["general", "security", "privacy"];

function tabFromHash(): SettingsTab {
  const hash = window.location.hash.slice(1);
  return TABS.includes(hash as SettingsTab) ? (hash as SettingsTab) : "general";
}

export default function SettingsPage() {
  const { data: session } = useHydratedSession();
  const [tab, setTab] = useState<SettingsTab>("general");

  useEffect(() => {
    const syncFromHash = () => setTab(tabFromHash());
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  if (!session) return null;

  const changeTab = (nextTab: SettingsTab) => {
    setTab(nextTab);
    window.history.replaceState(null, "", `${window.location.pathname}#${nextTab}`);
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={0.75} component="header">
        <Typography variant="overline" color="primary">Your account</Typography>
        <Typography variant="h2" component="h1">Settings</Typography>
        <Typography color="text.secondary">
          Preferences, sign-in security, and privacy controls—organized in one place.
        </Typography>
      </Stack>

      <Card variant="outlined">
        <Tabs
          value={tab}
          onChange={(_event, value: SettingsTab) => changeTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Settings sections"
        >
          <Tab icon={<TuneOutlined />} iconPosition="start" label="General" value="general" />
          <Tab icon={<LockOutlined />} iconPosition="start" label="Account & security" value="security" />
          <Tab icon={<PrivacyTipOutlined />} iconPosition="start" label="Privacy & data" value="privacy" />
        </Tabs>
      </Card>

      {tab === "general" ? (
        <Stack spacing={2.5} role="tabpanel" aria-label="General settings">
          <Stack spacing={0.5}>
            <Typography variant="h4" component="h2">General</Typography>
            <Typography color="text.secondary">
              Choose how UnivAI looks and which learning updates reach your email.
            </Typography>
          </Stack>
          <Card variant="outlined">
            <CardContent>
              <LanguageSettings initialLocale={session.user.uiLocale === "ar" ? "ar" : "en"} />
            </CardContent>
          </Card>
          <NotificationPreferences />
        </Stack>
      ) : null}

      {tab === "security" ? (
        <Stack role="tabpanel" aria-label="Account and security settings">
          <AccountSecuritySettings email={session.user.email} />
        </Stack>
      ) : null}

      {tab === "privacy" ? (
        <Stack role="tabpanel" aria-label="Privacy and data settings">
          <PrivacyCenter />
        </Stack>
      ) : null}
    </Stack>
  );
}
