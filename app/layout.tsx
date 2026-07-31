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
import OnboardingGuide from "./OnboardingGuide";
import OnboardingProvider from "./OnboardingProvider";

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
    default: "UnivAI — Clearer learning. Steadier progress.",
    template: "%s | UnivAI",
  },
  description:
    "A focused learning experience that helps learners build momentum and gives families greater confidence.",
  applicationName: "UnivAI",
  keywords: [
    "learning platform",
    "student progress",
    "family learning",
    "education",
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
            <OnboardingProvider>
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
              <OnboardingGuide />
              <AppMain>{children}</AppMain>
            </OnboardingProvider>
          </AppThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
