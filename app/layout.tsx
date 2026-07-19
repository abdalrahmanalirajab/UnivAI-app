import type { Metadata } from "next";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import CssBaseline from "@mui/material/CssBaseline";
import Container from "@mui/material/Container";
import Toolbar from "@mui/material/Toolbar";
import NavBar from "./NavBar";

export const metadata: Metadata = {
  title: "UnivAI",
  description: "One Book, One Month — autonomous learning simulator",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppRouterCacheProvider>
          <CssBaseline />
          <NavBar />
          <Container maxWidth="lg">
            {/* Toolbar as a pure-MUI vertical spacer: MUI v9 dropped system props
                (padding/margin) from Box and Stack, and the MUI Law forbids sx. */}
            <Toolbar variant="dense" />
            {children}
            <Toolbar />
          </Container>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
