"use client";

import { useEffect } from "react";

export default function LocaleBootstrap() {
  useEffect(() => {
    const renderedLocale = document.documentElement.lang === "ar" ? "ar" : "en";
    document.documentElement.lang = renderedLocale;
    document.documentElement.dir = renderedLocale === "ar" ? "rtl" : "ltr";
    window.localStorage.setItem("univai-ui-locale", renderedLocale);

    // The cookie handles anonymous visitors, while this account-backed lookup
    // restores a signed-in learner's preference on a new browser. Reload only
    // when the server persisted a different locale so the RTL Emotion cache and
    // server-rendered html attributes are rebuilt together.
    void fetch("/api/preferences/locale", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body: { locale?: unknown } | null) => {
        const accountLocale = body?.locale === "ar" ? "ar" : "en";
        window.localStorage.setItem("univai-ui-locale", accountLocale);
        if (accountLocale !== renderedLocale) window.location.reload();
      })
      .catch(() => {
        // Language restoration is best-effort; a transient request failure must
        // not prevent the rest of the application from hydrating.
      });
  }, []);
  return null;
}
