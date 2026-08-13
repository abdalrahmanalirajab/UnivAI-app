"use client";

import { ThemeProvider } from "@mui/material/styles";
import { createAppTheme } from "./theme";
import { useMemo } from "react";

export default function AppThemeProvider({
  children,
  direction = "ltr",
}: Readonly<{ children: React.ReactNode; direction?: "ltr" | "rtl" }>) {
  const theme = useMemo(() => createAppTheme(direction), [direction]);
  return (
    <ThemeProvider
      theme={theme}
      defaultMode="system"
      modeStorageKey="univai-color-mode"
      colorSchemeStorageKey="univai-color-scheme"
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
