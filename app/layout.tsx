import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import CssBaseline from "@mui/material/CssBaseline";
import AppMain from "./AppMain";
import AppThemeProvider from "./AppThemeProvider";
import NavBar from "./NavBar";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-univai",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "UnivAI — Turn one book into a guided semester",
    template: "%s | UnivAI",
  },
  description:
    "Build a structured, source-grounded learning path from a trusted book, with lessons, cited Q&A, practice, and assessments.",
  applicationName: "UnivAI",
  keywords: [
    "AI learning",
    "source-grounded education",
    "independent learning",
    "textbook course builder",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={manrope.variable} suppressHydrationWarning>
      <body>
        <InitColorSchemeScript
          attribute="class"
          defaultMode="system"
          modeStorageKey="univai-color-mode"
          colorSchemeStorageKey="univai-color-scheme"
        />
        <AppRouterCacheProvider>
          <AppThemeProvider>
            <CssBaseline enableColorScheme />
            <Button component="a" href="#main-content" className="skip-link">
              Skip to main content
            </Button>
            <NavBar />
            {process.env.UNIVAI_MODE === "standalone" &&
            process.env.NODE_ENV !== "production" ? (
              <Container maxWidth="xl" className="standalone-notice">
                <Alert severity="warning">Standalone development data</Alert>
              </Container>
            ) : null}
            <AppMain>{children}</AppMain>
          </AppThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
