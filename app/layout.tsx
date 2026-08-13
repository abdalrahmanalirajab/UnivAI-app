import type { Metadata } from "next";
import { Manrope, Noto_Kufi_Arabic } from "next/font/google";
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
import LocaleBootstrap from "./LocaleBootstrap";
import { cookies } from "next/headers";
import { UI_LOCALE_COOKIE } from "@/lib/legal";
import AppCacheProvider from "./AppCacheProvider";
import UiLocalizationProvider from "./UiLocalizationProvider";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-univai",
});
const notoKufiArabic = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  display: "swap",
  variable: "--font-univai-arabic",
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
  icons: {
    icon: "/brand/univai-mark.svg",
  },
  keywords: [
    "learning platform",
    "student progress",
    "family learning",
    "education",
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = (await cookies()).get(UI_LOCALE_COOKIE)?.value === "ar" ? "ar" : "en";
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={`${manrope.variable} ${notoKufiArabic.variable}`}
      suppressHydrationWarning
    >
      <body>
        <LocaleBootstrap />
        <InitColorSchemeScript
          attribute="class"
          defaultMode="system"
          modeStorageKey="univai-color-mode"
          colorSchemeStorageKey="univai-color-scheme"
        />
        <AppCacheProvider direction={locale === "ar" ? "rtl" : "ltr"}>
          <AppThemeProvider direction={locale === "ar" ? "rtl" : "ltr"}>
            <CssBaseline enableColorScheme />
            <UiLocalizationProvider locale={locale}>
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
            </UiLocalizationProvider>
          </AppThemeProvider>
        </AppCacheProvider>
      </body>
    </html>
  );
}
