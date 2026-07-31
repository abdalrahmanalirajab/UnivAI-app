"use client";

import { ThemeProvider } from "@mui/material/styles";
import theme from "./theme";

export default function AppThemeProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
