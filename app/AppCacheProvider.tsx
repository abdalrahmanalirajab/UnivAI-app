"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import rtlPlugin from "stylis-plugin-rtl";
import { prefixer } from "stylis";

export default function AppCacheProvider({
  direction,
  children,
}: {
  direction: "ltr" | "rtl";
  children: React.ReactNode;
}) {
  return (
    <AppRouterCacheProvider
      options={{
        key: direction === "rtl" ? "mui-rtl" : "mui",
        stylisPlugins: direction === "rtl" ? [prefixer, rtlPlugin] : [prefixer],
      }}
    >
      {children}
    </AppRouterCacheProvider>
  );
}
