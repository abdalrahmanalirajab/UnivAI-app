"use client";

import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";

export default function AppMain({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  if (pathname === "/") {
    return (
      <Box component="main" id="main-content" className="landing-main">
        {children}
      </Box>
    );
  }

  return (
    <Container
      component="main"
      id="main-content"
      maxWidth="xl"
      className="app-page-frame"
    >
      {children}
    </Container>
  );
}
