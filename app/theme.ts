import { createTheme } from "@mui/material/styles";

const focusRing = {
  outline: "3px solid var(--univai-palette-secondary-main)",
  outlineOffset: 3,
};

export function createAppTheme(direction: "ltr" | "rtl" = "ltr") {
  return createTheme({
    direction,
    cssVariables: {
      cssVarPrefix: "univai",
      colorSchemeSelector: "class",
    },
    colorSchemes: {
    light: {
      palette: {
        primary: {
          light: "#6366F1",
          main: "#4338CA",
          dark: "#312E81",
          contrastText: "#FFFFFF",
        },
        secondary: {
          light: "#14B8A6",
          main: "#0A5752",
          dark: "#084C48",
          contrastText: "#FFFFFF",
        },
        background: {
          default: "#F7F7FB",
          paper: "#FFFFFF",
        },
        text: {
          primary: "#172033",
          secondary: "#424B5E",
        },
        divider: "rgba(42, 49, 80, 0.14)",
        success: {
          main: "#125636",
          dark: "#0D482D",
          contrastText: "#FFFFFF",
        },
        warning: {
          main: "#704000",
          dark: "#603700",
          contrastText: "#FFFFFF",
        },
        error: {
          main: "#8E1B12",
          dark: "#74160F",
          contrastText: "#FFFFFF",
        },
        info: {
          main: "#0E527B",
          dark: "#0A4568",
          contrastText: "#FFFFFF",
        },
      },
    },
    dark: {
      palette: {
        primary: {
          light: "#C7D2FE",
          main: "#A5B4FC",
          dark: "#818CF8",
          contrastText: "#17153D",
        },
        secondary: {
          light: "#99F6E4",
          main: "#5EEAD4",
          dark: "#2DD4BF",
          contrastText: "#073B37",
        },
        background: {
          default: "#0D1324",
          paper: "#141C31",
        },
        text: {
          primary: "#F7F8FC",
          secondary: "#B7C0D3",
        },
        divider: "rgba(201, 210, 235, 0.17)",
        success: {
          main: "#62D49A",
          dark: "#3BB979",
        },
        warning: {
          main: "#F3B562",
          dark: "#D78C28",
        },
        error: {
          main: "#FF8A82",
          dark: "#E4625A",
        },
        info: {
          main: "#77C8F2",
          dark: "#44A7D9",
        },
      },
    },
  },
    typography: {
      fontFamily:
        'var(--font-univai), var(--font-univai-arabic), "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    h1: {
      fontSize: "clamp(2.75rem, 7vw, 5.75rem)",
      fontWeight: 800,
      letterSpacing: direction === "rtl" ? "normal" : "-0.055em",
      lineHeight: 0.98,
    },
    h2: {
      fontSize: "clamp(2rem, 4vw, 3.5rem)",
      fontWeight: 800,
      letterSpacing: direction === "rtl" ? "normal" : "-0.04em",
      lineHeight: 1.05,
    },
    h3: {
      fontSize: "clamp(1.45rem, 2.4vw, 2.25rem)",
      fontWeight: 750,
      letterSpacing: direction === "rtl" ? "normal" : "-0.025em",
      lineHeight: 1.15,
    },
    h4: {
      fontSize: "1.4rem",
      fontWeight: 750,
      letterSpacing: direction === "rtl" ? "normal" : "-0.018em",
      lineHeight: 1.2,
    },
    h5: {
      fontWeight: 750,
      letterSpacing: direction === "rtl" ? "normal" : "-0.014em",
      lineHeight: 1.25,
    },
    h6: {
      fontWeight: 750,
      lineHeight: 1.3,
    },
    subtitle1: {
      fontWeight: 650,
      lineHeight: 1.5,
    },
    body1: {
      fontSize: "1rem",
      lineHeight: 1.72,
    },
    body2: {
      lineHeight: 1.62,
    },
    button: {
      fontWeight: 750,
      letterSpacing: direction === "rtl" ? "normal" : "-0.005em",
    },
    overline: {
      fontWeight: 800,
      letterSpacing: direction === "rtl" ? "normal" : "0.12em",
      lineHeight: 1.5,
    },
  },
  shape: {
    borderRadius: 16,
  },
  transitions: {
    duration: {
      shortest: 100,
      shorter: 150,
      short: 180,
      standard: 240,
      complex: 320,
      enteringScreen: 240,
      leavingScreen: 180,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: (currentTheme) => ({
        html: {
          scrollBehavior: "smooth",
          scrollPaddingTop: 88,
        },
        body: {
          minWidth: 320,
          minHeight: "100vh",
          backgroundImage:
            "radial-gradient(circle at 8% -10%, color-mix(in srgb, var(--univai-palette-primary-main) 9%, transparent), transparent 31rem), radial-gradient(circle at 94% 18%, color-mix(in srgb, var(--univai-palette-secondary-main) 7%, transparent), transparent 28rem)",
          backgroundAttachment: "fixed",
        },
        "::selection": {
          backgroundColor:
            "color-mix(in srgb, var(--univai-palette-secondary-main) 28%, transparent)",
        },
        "a, button, [role='button'], input, textarea, select": {
          WebkitTapHighlightColor: "transparent",
        },
        "a:not(.MuiButtonBase-root):not(.MuiChip-root)": {
          textDecorationLine: "underline",
          textDecorationThickness: "0.1em",
          textUnderlineOffset: "0.18em",
        },
        "a:focus-visible, button:focus-visible, [role='button']:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible":
          focusRing,
        ".skip-link": {
          position: "fixed",
          zIndex: 2000,
          top: 12,
          insetInlineStart: 12,
          transform: "translateY(-180%)",
          backgroundColor: "var(--univai-palette-background-paper)",
          color: "var(--univai-palette-text-primary)",
          boxShadow: "0 8px 24px rgba(14, 23, 48, 0.18)",
        },
        ".skip-link:focus": {
          transform: "translateY(0)",
        },
        ".app-page-frame": {
          minHeight: "calc(100vh - 72px)",
          paddingTop: 40,
          paddingBottom: 72,
        },
        ".legal-document-section": {
          padding: 24,
        },
        ".privacy-request-heading": {
          alignItems: "center",
          flexWrap: "wrap",
        },
        ".standalone-notice": {
          paddingTop: 16,
        },
        ".onboarding-guide": {
          padding: 16,
        },
        ".onboarding-shell": {
          paddingTop: 16,
        },
        ".nav-shell": {
          width: "100%",
          minHeight: 72,
          display: "flex",
          alignItems: "center",
          gap: 16,
        },
        ".brand-link": {
          minWidth: "max-content",
          padding: 4,
          color: "var(--univai-palette-text-primary)",
        },
        ".brand-logo": {
          display: "block",
          flexShrink: 0,
          width: 40,
          height: 40,
        },
        ".brand-tagline": {
          display: "block",
          color: "var(--univai-palette-text-secondary)",
        },
        ".nav-links": {
          flex: 1,
          justifyContent: "center",
        },
        ".nav-actions": {
          marginInlineStart: "auto !important",
        },
        ".nav-link-active": {
          color: "var(--univai-palette-primary-main)",
          backgroundColor:
            "color-mix(in srgb, var(--univai-palette-primary-main) 10%, transparent)",
        },
        ".wrap-row": {
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
        },
        ".spread-row": {
          width: "100%",
          justifyContent: "space-between",
        },
        ".align-center": {
          alignItems: "center",
        },
        ".align-start": {
          alignItems: "flex-start",
        },
        ".align-end": {
          alignItems: "flex-end",
        },
        ".text-center": {
          textAlign: "center",
        },
        ".footer-bottom": {
          alignItems: "center",
        },
        ".mobile-nav-control": {
          display: "none !important",
        },
        ".drawer-paper": {
          width: "min(88vw, 360px)",
          padding: 20,
          backgroundImage: "none",
        },
        ".drawer-content": {
          height: "100%",
        },
        ".subscription-workspace": {
          width: "100%",
          maxWidth: 1120,
          marginInline: "auto",
          paddingBottom: 32,
          gap: "18px !important",
        },
        ".subscription-workspace > :not(style) ~ :not(style)": {
          marginTop: "0 !important",
        },
        ".subscription-hero": {
          alignItems: "flex-start",
          textAlign: "start",
          paddingBlock: 0,
        },
        ".subscription-lede": {
          maxWidth: 720,
          fontSize: "1rem",
        },
        ".subscription-loading": {
          minHeight: 56,
          alignItems: "center",
          justifyContent: "center",
        },
        ".subscription-action-rail": {
          width: "100%",
          minHeight: 58,
          justifyContent: "space-between",
          paddingBlock: 10,
          borderTop: "1px solid var(--univai-palette-divider)",
          borderBottom: "1px solid var(--univai-palette-divider)",
        },
        ".subscription-action-copy": {
          flex: 1,
        },
        ".subscription-desktop-policy": {
          display: "flex",
        },
        ".subscription-mobile-refund": {
          display: "none !important",
        },
        ".subscription-refund-tooltip": {
          maxWidth: "320px !important",
          padding: "10px 12px !important",
          borderRadius: "8px !important",
        },
        ".subscription-pricing-grid": {
          alignItems: "stretch",
        },
        ".subscription-plan-card": {
          height: "100%",
          display: "flex",
          flexDirection: "column",
          borderRadius: "16px !important",
          borderColor: "var(--univai-palette-divider)",
          background: "var(--univai-palette-background-paper)",
          boxShadow: "none",
          transition: "border-color 160ms ease, box-shadow 160ms ease",
        },
        ".subscription-plan-card:hover": {
          borderColor:
            "color-mix(in srgb, var(--univai-palette-primary-main) 38%, var(--univai-palette-divider))",
          boxShadow: "0 8px 24px rgba(7, 13, 32, 0.08)",
        },
        ".subscription-plan-card .MuiCardContent-root": {
          flex: 1,
          padding: "22px 22px 14px",
        },
        ".subscription-plan-card .MuiCardActions-root": {
          padding: "6px 22px 22px",
        },
        ".subscription-plan-featured": {
          borderColor:
            "color-mix(in srgb, var(--univai-palette-primary-main) 42%, var(--univai-palette-divider))",
        },
        ".subscription-plan-label": {
          color: "var(--univai-palette-text-secondary)",
          fontWeight: 700,
          letterSpacing: "0.07em",
        },
        ".subscription-plan-impact": {
          minHeight: 44,
          lineHeight: 1.45,
        },
        ".subscription-price-row": {
          minHeight: 60,
        },
        ".subscription-currency": {
          paddingBottom: 18,
          fontWeight: 700,
        },
        ".subscription-price": {
          lineHeight: 1,
          letterSpacing: "-0.04em",
        },
        ".subscription-price-period": {
          paddingBottom: 6,
        },
        ".subscription-credit-allowance": {
          gap: 10,
          minHeight: 54,
          paddingBlock: 10,
          borderTop: "1px solid var(--univai-palette-divider)",
          borderBottom: "1px solid var(--univai-palette-divider)",
        },
        ".subscription-feature-panel": {
          minHeight: 136,
        },
        ".subscription-feature-check": {
          flexShrink: 0,
          color: "var(--univai-palette-primary-main)",
        },
        ".subscription-plan-action": {
          minHeight: 44,
          borderRadius: "8px !important",
          fontWeight: "700 !important",
          boxShadow: "none !important",
        },
        ".subscription-plan-action.Mui-disabled": {
          opacity: 0.68,
        },
        ".membership-dialog-backdrop": {
          backdropFilter: "blur(4px)",
          backgroundColor: "rgba(8, 12, 22, 0.58) !important",
        },
        ".membership-dialog-paper, .membership-confirm-paper": {
          overflow: "hidden",
          border: "1px solid var(--univai-palette-divider)",
          borderRadius: "16px !important",
          background: "var(--univai-palette-background-paper)",
          boxShadow: "0 24px 70px rgba(4, 9, 24, 0.3)",
        },
        ".membership-dialog-paper": {
          maxWidth: "620px !important",
        },
        ".membership-dialog-title": {
          padding: "16px 20px 14px !important",
        },
        ".membership-dialog-content": {
          padding: "0 20px 8px !important",
        },
        ".membership-overview-header": {
          paddingBlock: 16,
        },
        ".membership-overview-balance": {
          alignItems: "flex-end",
        },
        ".membership-dialog-tabs": {
          minHeight: 40,
          borderBottom: "1px solid var(--univai-palette-divider)",
        },
        ".membership-dialog-tabs .MuiTab-root": {
          minWidth: 0,
          minHeight: 44,
          padding: "8px 12px",
          textTransform: "none",
        },
        ".membership-dialog-tabs .MuiTabs-indicator": {
          height: 2,
        },
        ".membership-tab-panel": {
          padding: "18px 0 4px",
        },
        ".membership-detail-row": {
          alignItems: "center",
          paddingBlock: 12,
          gap: 20,
        },
        ".membership-detail-row > :last-child": {
          textAlign: "end",
        },
        ".membership-section-heading": {
          alignItems: "center",
          marginTop: "18px !important",
          minHeight: 32,
        },
        ".membership-revoke-button": {
          width: "fit-content",
          marginTop: "12px !important",
          paddingInline: "0 !important",
        },
        ".credit-activity-list": {
          maxHeight: 320,
          overflowY: "auto",
          scrollbarGutter: "stable",
        },
        ".credit-activity-row": {
          minHeight: 58,
          padding: "8px 0 !important",
        },
        ".credit-activity-amount": {
          alignItems: "flex-end",
          flexShrink: 0,
        },
        ".membership-dialog-actions": {
          padding: "8px 12px !important",
        },
        "@media (max-width: 600px)": {
          ".subscription-workspace": {
            paddingBottom: 28,
            gap: "14px !important",
          },
          ".subscription-hero": {
            alignItems: "flex-start",
            textAlign: "start",
            paddingBlock: "2px 0",
          },
          ".subscription-hero .MuiTypography-h3": {
            fontSize: "1.8rem",
            lineHeight: 1.12,
          },
          ".subscription-lede": {
            fontSize: "0.95rem",
          },
          ".subscription-action-rail": {
            minHeight: 0,
            alignItems: "stretch !important",
            flexDirection: "column !important",
            padding: "10px !important",
          },
          ".subscription-action-copy": {
            alignItems: "flex-start !important",
          },
          ".subscription-action-buttons": {
            width: "100%",
            alignItems: "stretch !important",
          },
          ".subscription-action-buttons .MuiButton-root": {
            width: "100%",
          },
          ".subscription-desktop-policy": {
            display: "none",
          },
          ".subscription-mobile-refund": {
            display: "flex !important",
            padding: "2px 9px !important",
            borderRadius: "12px !important",
            fontSize: "0.78rem",
          },
          ".subscription-mobile-refund .MuiAlert-icon": {
            marginInlineEnd: 8,
            padding: "5px 0",
          },
          ".subscription-mobile-refund .MuiAlert-message": {
            padding: "5px 0",
          },
          ".subscription-plan-card": {
            height: "auto",
            borderRadius: "12px !important",
          },
          ".subscription-plan-card .MuiCardContent-root": {
            padding: "18px 18px 12px",
          },
          ".subscription-plan-card .MuiCardActions-root": {
            padding: "6px 18px 18px",
          },
          ".subscription-plan-impact": {
            minHeight: 0,
          },
          ".subscription-feature-panel": {
            minHeight: 0,
          },
          ".membership-dialog-paper": {
            margin: "10px !important",
            borderRadius: "12px !important",
          },
          ".membership-dialog-title": {
            padding: "14px !important",
          },
          ".membership-dialog-content": {
            padding: "0 14px 6px !important",
          },
          ".membership-overview-header": {
            paddingBlock: 14,
          },
        },
        ".subscription-teaser": {
          borderRadius: 18,
          borderColor:
            "color-mix(in srgb, var(--univai-palette-secondary-main) 45%, var(--univai-palette-divider))",
          backgroundColor:
            "color-mix(in srgb, var(--univai-palette-secondary-main) 5%, var(--univai-palette-background-paper))",
        },
        ".subscription-teaser-icon": {
          flexShrink: 0,
        },
        ".subscription-teaser-copy": {
          flex: 1,
        },
        ".paypal-return-card": {
          width: "100%",
          maxWidth: 680,
          marginInline: "auto",
          padding: 32,
          border: "1px solid var(--univai-palette-divider)",
          borderRadius: 20,
          backgroundColor: "var(--univai-palette-background-paper)",
        },
        ".landing-main": {
          overflow: "hidden",
        },
        "@keyframes voicePulse": {
          "0%, 100%": {
            transform: "scale(0.86)",
            opacity: 0.5,
          },
          "50%": {
            transform: "scale(1)",
            opacity: 1,
          },
        },
        "@keyframes raiseHandReadyPulse": {
          "0%, 100%": {
            transform: "scale(1)",
            boxShadow:
              "0 12px 34px color-mix(in srgb, var(--univai-palette-secondary-main) 26%, transparent), 0 0 0 0 color-mix(in srgb, var(--univai-palette-secondary-main) 30%, transparent)",
          },
          "50%": {
            transform: "scale(1.05)",
            boxShadow:
              "0 16px 42px color-mix(in srgb, var(--univai-palette-secondary-main) 32%, transparent), 0 0 0 12px color-mix(in srgb, var(--univai-palette-secondary-main) 0%, transparent)",
          },
        },
        ".background-paths": {
          position: "absolute",
          zIndex: 0,
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          contain: "paint",
        },
        ".background-path-svg": {
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          backfaceVisibility: "hidden",
        },
        ".background-path-base-layer": {
          opacity: 0.52,
          transform: "translateZ(0)",
        },
        ".background-path-motion-canvas": {
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0.78,
          transform: "translateZ(0)",
        },
        ".background-path-secondary": {
          color: "var(--univai-palette-secondary-main)",
          opacity: 0.68,
        },
        ".background-path-primary": {
          color: "var(--univai-palette-primary-main)",
          opacity: 0.82,
        },
        ".shape-hero-section": {
          isolation: "isolate",
          overflow: "hidden",
          background:
            "linear-gradient(145deg, color-mix(in srgb, var(--univai-palette-primary-main) 8%, var(--univai-palette-background-default)), var(--univai-palette-background-default) 54%, color-mix(in srgb, var(--univai-palette-secondary-main) 7%, var(--univai-palette-background-default)))",
        },
        ".shape-hero-section::before": {
          display: "none",
        },
        ".shape-hero-container": {
          position: "relative",
          zIndex: 1,
        },
        ".simple-hero-section": {
          minHeight: "min(860px, calc(100svh - 72px))",
        },
        ".simple-hero-copy": {
          maxWidth: 980,
          marginInline: "auto",
          alignItems: "center",
          textAlign: "center",
        },
        ".simple-hero-copy .hero-subhead": {
          maxWidth: 760,
        },
        ".simple-hero-proof": {
          justifyContent: "center",
        },
        ".hero-eyebrow": {
          backgroundColor:
            "color-mix(in srgb, var(--univai-palette-background-paper) 92%, var(--univai-palette-primary-main))",
        },
        ".landing-section": {
          paddingBlock: 104,
          scrollMarginTop: 80,
        },
        ".landing-section-compact": {
          paddingBlock: 40,
        },
        ".landing-section-soft": {
          backgroundColor:
            "color-mix(in srgb, var(--univai-palette-primary-main) 4%, var(--univai-palette-background-default))",
          borderBlock:
            "1px solid color-mix(in srgb, var(--univai-palette-divider) 70%, transparent)",
        },
        ".section-heading": {
          maxWidth: 760,
        },
        ".section-copy": {
          maxWidth: 690,
          fontSize: "1.08rem",
        },
        ".eyebrow-chip": {
          width: "fit-content",
          fontWeight: 800,
          letterSpacing: "0.035em",
        },
        ".hero-section": {
          position: "relative",
          minHeight: "calc(100svh - 72px)",
          display: "flex",
          alignItems: "center",
          paddingBlock: 80,
        },
        ".hero-section::before": {
          content: '""',
          position: "absolute",
          width: 420,
          height: 420,
          top: -180,
          insetInlineEnd: -120,
          borderRadius: "50%",
          background:
            "color-mix(in srgb, var(--univai-palette-secondary-main) 10%, transparent)",
          filter: "blur(4px)",
          pointerEvents: "none",
        },
        ".hero-copy": {
          position: "relative",
          zIndex: 1,
        },
        ".hero-headline-accent": {
          color: "var(--univai-palette-primary-main)",
        },
        ".hero-headline-secondary": {
          color: "var(--univai-palette-secondary-main)",
        },
        ".hero-subhead": {
          maxWidth: 660,
          fontSize: "clamp(1.05rem, 1.5vw, 1.25rem)",
        },
        ".hero-actions": {
          alignItems: "center",
        },
        ".hero-visual-shell": {
          position: "relative",
          minHeight: 520,
          borderRadius: 28,
          overflow: "hidden",
          border: "1px solid var(--univai-palette-divider)",
          boxShadow: "0 28px 70px rgba(20, 28, 60, 0.20)",
          backgroundColor: "var(--univai-palette-background-paper)",
        },
        ".hero-image": {
          objectFit: "cover",
        },
        ".hero-image-scrim": {
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, transparent 46%, rgba(8, 16, 38, 0.78) 100%)",
          pointerEvents: "none",
        },
        ".hero-progress-card": {
          position: "absolute",
          insetInline: 18,
          bottom: 18,
          padding: 16,
          color: "#FFFFFF !important",
          background: "rgba(10, 20, 45, 0.78) !important",
          border: "1px solid rgba(255, 255, 255, 0.22)",
          backdropFilter: "blur(16px)",
        },
        ".hero-float-chip": {
          position: "absolute",
          top: 18,
          insetInlineEnd: 18,
          color: "#113A36 !important",
          background: "#CCFBF1 !important",
          boxShadow: "0 10px 28px rgba(8, 18, 42, 0.18)",
        },
        ".trust-grid": {
          alignItems: "stretch",
        },
        ".trust-item": {
          height: "100%",
          padding: 20,
          borderRadius: 18,
          border: "1px solid var(--univai-palette-divider)",
          backgroundColor:
            "color-mix(in srgb, var(--univai-palette-background-paper) 88%, transparent)",
        },
        ".step-card": {
          position: "relative",
          height: "100%",
          overflow: "visible",
        },
        ".step-number": {
          width: 36,
          height: 36,
          fontWeight: 800,
          color: "var(--univai-palette-primary-contrastText) !important",
          background: "var(--univai-palette-primary-main) !important",
        },
        ".feature-card": {
          height: "100%",
        },
        ".bento-card": {
          height: "100%",
          minHeight: 330,
          overflow: "hidden",
          background:
            "linear-gradient(145deg, var(--univai-palette-background-paper), color-mix(in srgb, var(--univai-palette-primary-main) 4%, var(--univai-palette-background-paper)))",
          transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
          "&:hover": {
            transform: "translateY(-3px)",
            borderColor:
              "color-mix(in srgb, var(--univai-palette-primary-main) 36%, var(--univai-palette-divider))",
            boxShadow: "0 18px 46px rgba(17, 28, 64, 0.11)",
          },
        },
        ".bento-card-wide": {
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--univai-palette-primary-main) 9%, var(--univai-palette-background-paper)), color-mix(in srgb, var(--univai-palette-secondary-main) 7%, var(--univai-palette-background-paper)))",
        },
        ".bento-card-content": {
          minHeight: 280,
        },
        ".bento-icon": {
          width: 46,
          height: 46,
          color: "var(--univai-palette-primary-main) !important",
          background:
            "color-mix(in srgb, var(--univai-palette-primary-main) 11%, var(--univai-palette-background-paper)) !important",
        },
        ".bento-visual": {
          marginTop: "auto !important",
          padding: 18,
          borderRadius: 16,
          border: "1px solid var(--univai-palette-divider)",
          backgroundColor:
            "color-mix(in srgb, var(--univai-palette-background-default) 72%, transparent)",
        },
        ".bento-source-row": {
          alignItems: "center",
          flexWrap: "wrap",
        },
        ".voice-live-dot": {
          width: 14,
          height: 14,
          flex: "0 0 auto",
          borderRadius: "50%",
          backgroundColor: "var(--univai-palette-secondary-main)",
          boxShadow:
            "0 0 0 7px color-mix(in srgb, var(--univai-palette-secondary-main) 14%, transparent)",
          animation: "voicePulse 1.3s ease-in-out infinite",
        },
        ".feature-carousel": {
          overflow: "hidden",
          border: "1px solid var(--univai-palette-divider)",
          borderRadius: "28px !important",
          backgroundColor: "var(--univai-palette-background-paper) !important",
          boxShadow: "0 26px 68px rgba(17, 28, 64, 0.12)",
        },
        ".feature-carousel-copy": {
          minHeight: 520,
          padding: 42,
          justifyContent: "center",
        },
        ".carousel-icon": {
          width: 56,
          height: 56,
          color: "var(--univai-palette-primary-contrastText) !important",
          background:
            "linear-gradient(135deg, var(--univai-palette-primary-main), var(--univai-palette-secondary-main)) !important",
        },
        ".carousel-proof": {
          width: "fit-content",
        },
        ".carousel-controls": {
          flexWrap: "wrap",
        },
        ".carousel-dot": {
          width: 10,
          height: 10,
          padding: 0,
          border: 0,
          borderRadius: 999,
          cursor: "pointer",
          backgroundColor: "var(--univai-palette-divider)",
          transition: "width 180ms ease, background-color 180ms ease",
        },
        ".carousel-dot-active": {
          width: 32,
          backgroundColor: "var(--univai-palette-primary-main)",
        },
        ".feature-carousel-preview-grid": {
          display: "flex",
          minHeight: 520,
          padding: 30,
          background:
            "linear-gradient(145deg, color-mix(in srgb, var(--univai-palette-primary-main) 11%, var(--univai-palette-background-default)), color-mix(in srgb, var(--univai-palette-secondary-main) 9%, var(--univai-palette-background-default)))",
        },
        ".feature-carousel-preview": {
          width: "100%",
          display: "flex",
          alignItems: "center",
        },
        ".carousel-demo": {
          width: "100%",
          padding: 28,
          borderRadius: 22,
          border:
            "1px solid color-mix(in srgb, var(--univai-palette-primary-main) 20%, var(--univai-palette-divider))",
          backgroundColor:
            "color-mix(in srgb, var(--univai-palette-background-paper) 90%, transparent)",
          boxShadow: "0 22px 50px rgba(19, 28, 61, 0.14)",
          backdropFilter: "blur(16px)",
        },
        ".carousel-demo-icon": {
          color: "var(--univai-palette-primary-main) !important",
          background:
            "color-mix(in srgb, var(--univai-palette-primary-main) 11%, var(--univai-palette-background-paper)) !important",
        },
        ".carousel-demo-row": {
          minHeight: 52,
          paddingInline: 14,
          borderRadius: 13,
          border: "1px solid var(--univai-palette-divider)",
        },
        ".carousel-answer, .carousel-next-action": {
          padding: 18,
          border: "1px solid var(--univai-palette-divider)",
          backgroundColor:
            "color-mix(in srgb, var(--univai-palette-background-default) 72%, transparent) !important",
        },
        ".voice-orb": {
          width: 64,
          height: 64,
          flex: "0 0 auto",
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 36% 34%, #FFFFFF 0 8%, var(--univai-palette-secondary-light) 10%, var(--univai-palette-primary-main) 68%, var(--univai-palette-primary-dark) 100%)",
          boxShadow:
            "0 0 0 10px color-mix(in srgb, var(--univai-palette-secondary-main) 12%, transparent), 0 16px 30px color-mix(in srgb, var(--univai-palette-primary-main) 25%, transparent)",
          animation: "voicePulse 1.6s ease-in-out infinite",
        },
        ".voice-state-card": {
          padding: 22,
          border:
            "1px solid color-mix(in srgb, var(--univai-palette-secondary-main) 32%, var(--univai-palette-divider))",
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--univai-palette-secondary-main) 7%, var(--univai-palette-background-paper)), var(--univai-palette-background-paper)) !important",
        },
        ".voice-state-icon": {
          width: 48,
          height: 48,
          color: "var(--univai-palette-secondary-main) !important",
          background:
            "color-mix(in srgb, var(--univai-palette-secondary-main) 11%, var(--univai-palette-background-paper)) !important",
        },
        ".voice-state-icon-active": {
          boxShadow:
            "0 0 0 8px color-mix(in srgb, var(--univai-palette-secondary-main) 11%, transparent)",
          animation: "voicePulse 1.35s ease-in-out infinite",
        },
        ".voice-state-label": {
          width: "fit-content",
        },
        ".raise-hand-dock": {
          position: "fixed",
          zIndex: currentTheme.zIndex.snackbar,
          insetInlineEnd: 28,
          bottom: "calc(24px + env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 10,
          justifyContent: "flex-end",
          pointerEvents: "none",
        },
        ".raise-hand-history-control": {
          width: 56,
          height: 56,
          overflow: "visible",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "auto",
          borderRadius: "999px !important",
          color: "var(--univai-palette-primary-main) !important",
          border: "1px solid var(--univai-palette-divider)",
          backgroundColor: "var(--univai-palette-background-paper) !important",
          boxShadow: "0 12px 32px rgba(7, 13, 32, 0.14)",
        },
        ".raise-hand-history-control .raise-hand-round-button": {
          width: "56px !important",
          height: "56px !important",
        },
        ".raise-hand-control": {
          width: 64,
          minHeight: 64,
          maxHeight: 64,
          padding: 0,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          pointerEvents: "auto",
          borderRadius: "999px !important",
          color: "var(--univai-palette-primary-contrastText) !important",
          border:
            "1px solid color-mix(in srgb, var(--univai-palette-primary-contrastText) 20%, transparent)",
          transition:
            "width 320ms cubic-bezier(0.22, 1, 0.36, 1), max-height 320ms cubic-bezier(0.22, 1, 0.36, 1), min-height 320ms cubic-bezier(0.22, 1, 0.36, 1), padding 260ms ease, border-radius 320ms cubic-bezier(0.22, 1, 0.36, 1), background-color 220ms ease, box-shadow 220ms ease",
          willChange: "width, max-height, min-height, border-radius",
        },
        ".raise-hand-control-idle": {
          backgroundColor: "var(--univai-palette-primary-main) !important",
          boxShadow:
            "0 14px 36px color-mix(in srgb, var(--univai-palette-primary-main) 28%, transparent)",
        },
        ".raise-hand-control-waiting": {
          color: "var(--univai-palette-secondary-main) !important",
          backgroundColor: "var(--univai-palette-background-paper) !important",
          borderColor:
            "color-mix(in srgb, var(--univai-palette-secondary-main) 36%, var(--univai-palette-divider))",
          boxShadow: "0 12px 32px rgba(7, 13, 32, 0.14)",
        },
        ".raise-hand-control-ready": {
          backgroundColor: "var(--univai-palette-secondary-main) !important",
          animation: "raiseHandReadyPulse 1.45s ease-in-out infinite",
        },
        ".raise-hand-control-recording": {
          width: "min(86vw, 350px)",
          background:
            "linear-gradient(120deg, var(--univai-palette-primary-main), var(--univai-palette-secondary-main)) !important",
          boxShadow:
            "0 16px 42px color-mix(in srgb, var(--univai-palette-primary-main) 28%, transparent)",
        },
        ".raise-hand-control-processing, .raise-hand-control-answering": {
          width: "min(82vw, 290px)",
          background:
            "linear-gradient(120deg, var(--univai-palette-primary-main), var(--univai-palette-secondary-main)) !important",
          boxShadow:
            "0 16px 42px color-mix(in srgb, var(--univai-palette-primary-main) 24%, transparent)",
        },
        ".raise-hand-control-review": {
          width: "min(92vw, 480px)",
          minHeight: 250,
          maxHeight: 430,
          padding: 18,
          alignItems: "stretch",
          justifyContent: "flex-start",
          color: "var(--univai-palette-text-primary) !important",
          borderRadius: "24px !important",
          borderColor:
            "color-mix(in srgb, var(--univai-palette-secondary-main) 28%, var(--univai-palette-divider))",
          backgroundColor: "var(--univai-palette-background-paper) !important",
          boxShadow: "0 22px 64px rgba(7, 13, 32, 0.2)",
        },
        ".raise-hand-round-content": {
          width: 64,
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
        ".raise-hand-round-button": {
          width: "64px !important",
          height: "64px !important",
          borderRadius: "50% !important",
          color: "inherit !important",
        },
        ".raise-hand-recording-content, .raise-hand-busy-content": {
          width: "100%",
          minWidth: 0,
          paddingInline: 10,
          whiteSpace: "nowrap",
        },
        ".raise-hand-waveform": {
          width: "100%",
          minWidth: 88,
          height: 32,
          flex: 1,
          color: "currentColor",
        },
        ".raise-hand-waveform rect": {
          transition: "height 70ms linear, y 70ms linear",
        },
        ".raise-hand-recording-label": {
          color: "inherit !important",
        },
        ".raise-hand-review-content": {
          width: "100%",
        },
        ".raise-hand-answer-popper": {
          zIndex: currentTheme.zIndex.snackbar + 1,
        },
        ".raise-hand-answer-card": {
          width: "min(88vw, 430px)",
          padding: 18,
          border:
            "1px solid color-mix(in srgb, var(--univai-palette-secondary-main) 28%, var(--univai-palette-divider))",
          borderRadius: "22px !important",
          background:
            "linear-gradient(145deg, color-mix(in srgb, var(--univai-palette-secondary-main) 6%, var(--univai-palette-background-paper)), var(--univai-palette-background-paper)) !important",
          boxShadow: "0 22px 64px rgba(7, 13, 32, 0.2)",
        },
        ".raise-hand-conversation-drawer": {
          width: "min(92vw, 440px)",
          padding: 20,
          overflow: "hidden",
          backgroundImage: "none",
        },
        ".raise-hand-conversation-content": {
          height: "100%",
          minHeight: 0,
        },
        ".raise-hand-history-list": {
          minHeight: 0,
          overflowY: "auto",
          paddingInlineEnd: 4,
        },
        ".raise-hand-history-turn": {
          padding: 16,
          borderRadius: "18px !important",
        },
        ".container-preview-section": {
          paddingBottom: 48,
        },
        ".scroll-showcase": {
          minHeight: 760,
          marginTop: 20,
          paddingTop: 54,
          perspective: 1400,
        },
        ".scroll-showcase-stage": {
          transformOrigin: "center top",
          willChange: "transform",
        },
        ".scroll-showcase-frame": {
          maxWidth: 1120,
          marginInline: "auto",
          overflow: "hidden",
          border: "1px solid var(--univai-palette-divider)",
          borderRadius: "28px !important",
          backgroundColor: "var(--univai-palette-background-paper) !important",
          boxShadow: "0 36px 90px rgba(14, 24, 58, 0.22)",
        },
        ".scroll-showcase-toolbar": {
          height: 46,
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingInline: 18,
          borderBottom: "1px solid var(--univai-palette-divider)",
          backgroundColor:
            "color-mix(in srgb, var(--univai-palette-background-default) 84%, transparent)",
        },
        ".scroll-showcase-toolbar span": {
          width: 10,
          height: 10,
          borderRadius: "50%",
          backgroundColor: "var(--univai-palette-divider)",
        },
        ".today-preview": {
          padding: 34,
        },
        ".today-preview-action": {
          padding: 24,
          border:
            "1px solid color-mix(in srgb, var(--univai-palette-secondary-main) 36%, var(--univai-palette-divider))",
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--univai-palette-secondary-main) 7%, var(--univai-palette-background-paper)), var(--univai-palette-background-paper)) !important",
        },
        ".preview-status-chip": {
          width: "fit-content",
        },
        ".today-preview-stat": {
          height: "100%",
          padding: 18,
          border: "1px solid var(--univai-palette-divider)",
        },
        ".preview-stat-icon": {
          width: 40,
          height: 40,
          color: "var(--univai-palette-primary-main) !important",
          background:
            "color-mix(in srgb, var(--univai-palette-primary-main) 10%, var(--univai-palette-background-paper)) !important",
        },
        ".dashboard-loading": {
          minHeight: 320,
          alignItems: "center",
          justifyContent: "center",
        },
        ".today-focus-card": {
          overflow: "hidden",
          borderWidth: 1.5,
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--univai-palette-primary-main) 8%, var(--univai-palette-background-paper)), var(--univai-palette-background-paper))",
          boxShadow: "0 18px 48px rgba(18, 28, 64, 0.10)",
        },
        ".today-focus-live": {
          borderColor:
            "color-mix(in srgb, var(--univai-palette-success-main) 48%, var(--univai-palette-divider))",
        },
        ".today-focus-assessment": {
          borderColor:
            "color-mix(in srgb, var(--univai-palette-warning-main) 48%, var(--univai-palette-divider))",
        },
        ".focus-chip": {
          width: "fit-content",
        },
        ".today-focus-copy": {
          maxWidth: 720,
        },
        ".pulse-card": {
          height: "100%",
        },
        ".pulse-icon": {
          width: 46,
          height: 46,
          color: "var(--univai-palette-primary-main) !important",
          background:
            "color-mix(in srgb, var(--univai-palette-primary-main) 10%, var(--univai-palette-background-paper)) !important",
        },
        ".dashboard-status-chip": {
          alignSelf: "center",
        },
        ".admin-loading": {
          minHeight: 360,
          alignItems: "center",
          justifyContent: "center",
        },
        ".admin-page-header": {
          alignItems: "flex-end",
          paddingBottom: 8,
          borderBottom: "1px solid var(--univai-palette-divider)",
        },
        ".admin-users-button": {
          marginInlineStart: "auto !important",
        },
        ".admin-command-card": {
          borderColor:
            "color-mix(in srgb, var(--univai-palette-primary-main) 28%, var(--univai-palette-divider))",
        },
        ".admin-clock-summary": {
          alignItems: "flex-end",
        },
        ".admin-tabs-shell": {
          border: "1px solid var(--univai-palette-divider)",
          borderRadius: "16px !important",
          overflow: "hidden",
        },
        ".admin-empty-state": {
          minHeight: 300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderStyle: "dashed",
        },
        ".admin-empty-state .MuiCardContent-root": {
          maxWidth: 540,
        },
        ".admin-empty-icon": {
          width: 58,
          height: 58,
          color: "var(--univai-palette-primary-main) !important",
          background:
            "color-mix(in srgb, var(--univai-palette-primary-main) 10%, var(--univai-palette-background-paper)) !important",
        },
        ".admin-metric-card": {
          height: "100%",
          minHeight: 220,
        },
        ".admin-metric-icon, .admin-section-icon": {
          width: 44,
          height: 44,
          color: "var(--univai-palette-primary-main) !important",
          background:
            "color-mix(in srgb, var(--univai-palette-primary-main) 10%, var(--univai-palette-background-paper)) !important",
        },
        ".admin-metric-success": {
          color: "var(--univai-palette-success-main) !important",
          background:
            "color-mix(in srgb, var(--univai-palette-success-main) 10%, var(--univai-palette-background-paper)) !important",
        },
        ".admin-metric-warning": {
          color: "var(--univai-palette-warning-main) !important",
          background:
            "color-mix(in srgb, var(--univai-palette-warning-main) 10%, var(--univai-palette-background-paper)) !important",
        },
        ".admin-metric-error": {
          color: "var(--univai-palette-error-main) !important",
          background:
            "color-mix(in srgb, var(--univai-palette-error-main) 10%, var(--univai-palette-background-paper)) !important",
        },
        ".admin-action-button": {
          alignSelf: "flex-start",
        },
        ".admin-danger-zone": {
          borderColor:
            "color-mix(in srgb, var(--univai-palette-warning-main) 48%, var(--univai-palette-divider))",
        },
        ".admin-table-scroll": {
          overflowX: "auto",
        },
        ".feature-icon": {
          width: 48,
          height: 48,
          color: "var(--univai-palette-primary-main) !important",
          background:
            "color-mix(in srgb, var(--univai-palette-primary-main) 10%, transparent) !important",
        },
        ".live-preview": {
          overflow: "hidden",
          borderRadius: 28,
        },
        ".lecture-stage": {
          minHeight: 360,
          padding: 28,
          background:
            "linear-gradient(145deg, color-mix(in srgb, var(--univai-palette-primary-main) 18%, var(--univai-palette-background-paper)), var(--univai-palette-background-paper))",
        },
        ".lecture-slide": {
          minHeight: 220,
          padding: 28,
          borderRadius: 20,
          border: "1px solid var(--univai-palette-divider)",
          backgroundColor: "var(--univai-palette-background-paper)",
        },
        ".lecture-sidebar": {
          height: "100%",
          padding: 28,
          borderInlineStart: "1px solid var(--univai-palette-divider)",
          backgroundColor: "var(--univai-palette-background-paper)",
        },
        ".source-answer": {
          borderInlineStart: "4px solid var(--univai-palette-secondary-main)",
        },
        ".synced-voice-player": {
          padding: 16,
          borderRadius: 16,
          backgroundColor:
            "color-mix(in srgb, var(--univai-palette-secondary-main) 7%, var(--univai-palette-background-paper))",
          border:
            "1px solid color-mix(in srgb, var(--univai-palette-secondary-main) 24%, var(--univai-palette-divider))",
        },
        ".voice-audio-element": {
          display: "none",
        },
        ".voice-control-row": {
          flexWrap: "wrap",
        },
        ".voice-status-chip": {
          marginInlineStart: "auto !important",
        },
        ".synced-transcript": {
          lineHeight: 1.9,
          fontWeight: 650,
        },
        ".synced-word": {
          display: "inline",
          borderRadius: 6,
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
          transition:
            "color 100ms ease, background-color 100ms ease, box-shadow 100ms ease",
        },
        ".synced-word-active": {
          color: "var(--univai-palette-secondary-contrastText)",
          backgroundColor: "var(--univai-palette-secondary-main)",
          boxShadow:
            "0 0 0 3px color-mix(in srgb, var(--univai-palette-secondary-main) 22%, transparent)",
        },
        ".voice-timeline-row": {
          width: "100%",
        },
        ".voice-timeline": {
          flex: 1,
        },
        ".voice-time": {
          minWidth: 34,
          color: "var(--univai-palette-text-secondary)",
          fontVariantNumeric: "tabular-nums",
        },
        ".audience-guardrail": {
          height: "100%",
          borderColor:
            "color-mix(in srgb, var(--univai-palette-warning-main) 50%, var(--univai-palette-divider))",
        },
        ".journey-line": {
          position: "relative",
        },
        ".journey-line::before": {
          content: '""',
          position: "absolute",
          top: 23,
          insetInline: "8%",
          height: 2,
          background:
            "linear-gradient(90deg, var(--univai-palette-primary-main), var(--univai-palette-secondary-main))",
          opacity: 0.34,
          pointerEvents: "none",
        },
        ".journey-node": {
          position: "relative",
          zIndex: 1,
          alignItems: "center",
          textAlign: "center",
        },
        ".journey-icon": {
          width: 48,
          height: 48,
          color: "var(--univai-palette-primary-contrastText) !important",
          background: "var(--univai-palette-primary-main) !important",
          boxShadow:
            "0 8px 20px color-mix(in srgb, var(--univai-palette-primary-main) 24%, transparent)",
        },
        ".final-cta": {
          position: "relative",
          overflow: "hidden",
          borderRadius: 30,
          padding: 56,
          color: "#FFFFFF",
          background:
            "linear-gradient(135deg, #312E81 0%, #4338CA 55%, #0F766E 135%)",
          boxShadow: "0 28px 70px rgba(35, 31, 110, 0.24)",
        },
        ".final-cta::after": {
          content: '""',
          position: "absolute",
          width: 260,
          height: 260,
          insetInlineEnd: -80,
          bottom: -150,
          borderRadius: "50%",
          border: "38px solid rgba(255, 255, 255, 0.09)",
          pointerEvents: "none",
        },
        ".footer-shell": {
          paddingBlock: 64,
          borderTop: "1px solid var(--univai-palette-divider)",
        },
        [currentTheme.breakpoints.down("md")]: {
          ".desktop-nav": {
            display: "none !important",
          },
          ".mobile-nav-control": {
            display: "inline-flex !important",
          },
          ".brand-tagline": {
            display: "none",
          },
          ".landing-section": {
            paddingBlock: 80,
          },
          ".hero-section": {
            minHeight: "auto",
            paddingBlock: 64,
          },
          ".hero-visual-shell": {
            minHeight: 440,
          },
          ".feature-carousel-copy, .feature-carousel-preview-grid": {
            minHeight: "auto",
          },
          ".feature-carousel-copy": {
            padding: 32,
          },
          ".feature-carousel-preview-grid": {
            padding: 24,
          },
          ".scroll-showcase": {
            minHeight: 650,
          },
          ".lecture-sidebar": {
            borderInlineStart: 0,
            borderTop: "1px solid var(--univai-palette-divider)",
          },
          ".journey-line::before": {
            display: "none",
          },
        },
        [currentTheme.breakpoints.down("sm")]: {
          ".app-page-frame": {
            paddingTop: 24,
            paddingBottom: 48,
          },
          ".landing-section": {
            paddingBlock: 64,
          },
          ".landing-section-compact": {
            paddingBlock: 32,
          },
          ".hero-section": {
            paddingBlock: 48,
          },
          ".hero-actions": {
            alignItems: "stretch",
          },
          ".hero-actions > *": {
            width: "100%",
          },
          ".hero-visual-shell": {
            minHeight: 360,
            borderRadius: 22,
          },
          ".feature-carousel-copy": {
            padding: 24,
          },
          ".feature-carousel-preview-grid": {
            padding: 16,
          },
          ".carousel-demo": {
            padding: 20,
          },
          ".scroll-showcase": {
            minHeight: "auto",
            paddingTop: 36,
          },
          ".scroll-showcase-frame": {
            borderRadius: "22px !important",
          },
          ".today-preview": {
            padding: 18,
          },
          ".hero-float-chip": {
            top: 12,
            insetInlineEnd: 12,
          },
          ".final-cta": {
            padding: 32,
            borderRadius: 24,
          },
          ".voice-status-chip": {
            width: "100%",
            marginInlineStart: "0 !important",
          },
          ".footer-bottom": {
            alignItems: "flex-start",
          },
          ".admin-page-header": {
            alignItems: "flex-start",
          },
          ".admin-users-button": {
            marginInlineStart: "0 !important",
          },
          ".admin-clock-summary": {
            alignItems: "flex-start",
          },
          ".raise-hand-dock": {
            insetInlineEnd: 12,
            bottom: "calc(12px + env(safe-area-inset-bottom))",
          },
          ".raise-hand-control-recording": {
            width: "min(94vw, 350px)",
          },
          ".raise-hand-control-review": {
            width: "calc(100vw - 24px)",
            maxHeight: "min(430px, 70vh)",
          },
          ".raise-hand-recording-label": {
            display: "none",
          },
          ".raise-hand-answer-card": {
            width: "calc(100vw - 24px)",
          },
          ".raise-hand-conversation-drawer": {
            width: "min(100vw, 440px)",
            padding: 16,
          },
        },
        "@media (prefers-reduced-motion: reduce)": {
          html: {
            scrollBehavior: "auto",
          },
          body: {
            backgroundAttachment: "scroll",
          },
          "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            animationIterationCount: "1 !important",
            scrollBehavior: "auto !important",
            transitionDuration: "0.01ms !important",
          },
        },
        "@media (forced-colors: active)": {
          "a:focus-visible, button:focus-visible, [role='button']:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible": {
            outlineColor: "CanvasText",
          },
        },
      }),
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          color: "var(--univai-palette-text-primary)",
          backgroundColor:
            "color-mix(in srgb, var(--univai-palette-background-default) 96%, var(--univai-palette-primary-main))",
          backgroundImage: "none",
          borderBottom: "1px solid var(--univai-palette-divider)",
        },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: 72,
        },
      },
    },
    MuiButtonBase: {
      styleOverrides: {
        root: {
          transition:
            "color 150ms ease, background-color 150ms ease, border-color 150ms ease, box-shadow 180ms ease, transform 150ms ease",
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          minHeight: 44,
          borderRadius: 13,
          paddingInline: 18,
          textTransform: "none",
        },
        sizeSmall: {
          minHeight: 44,
          borderRadius: 11,
        },
        contained: {
          boxShadow:
            "0 8px 18px color-mix(in srgb, var(--univai-palette-primary-main) 20%, transparent)",
          "&:hover": {
            transform: "translateY(-1px)",
            boxShadow:
              "0 12px 24px color-mix(in srgb, var(--univai-palette-primary-main) 26%, transparent)",
          },
          "&:active": {
            transform: "translateY(0)",
          },
        },
        outlined: {
          borderWidth: 1.5,
          "&:hover": {
            borderWidth: 1.5,
            backgroundColor:
              "color-mix(in srgb, var(--univai-palette-primary-main) 7%, transparent)",
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          width: 44,
          height: 44,
          borderRadius: 12,
          "&:hover": {
            backgroundColor:
              "color-mix(in srgb, var(--univai-palette-primary-main) 9%, transparent)",
          },
          "&:active": {
            transform: "scale(0.96)",
          },
        },
      },
    },
    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid var(--univai-palette-divider)",
          borderRadius: 20,
        },
      },
    },
    MuiCardActionArea: {
      styleOverrides: {
        root: {
          height: "100%",
          borderRadius: 20,
          "&:hover": {
            transform: "translateY(-2px)",
            boxShadow: "0 12px 30px rgba(14, 23, 48, 0.10)",
          },
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: 24,
          "&:last-child": {
            paddingBottom: 24,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
        rounded: {
          borderRadius: 18,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          minHeight: 48,
          borderRadius: 13,
          backgroundColor:
            "color-mix(in srgb, var(--univai-palette-background-paper) 92%, transparent)",
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--univai-palette-primary-main)",
          },
          "&.Mui-focused": {
            boxShadow:
              "0 0 0 3px color-mix(in srgb, var(--univai-palette-primary-main) 14%, transparent)",
          },
        },
        notchedOutline: {
          borderColor: "var(--univai-palette-divider)",
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontWeight: 650,
        },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          lineHeight: 1.45,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          minHeight: 32,
          borderRadius: 10,
          fontWeight: 700,
          "&.MuiChip-clickable": {
            minHeight: 44,
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 44,
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          padding: 10,
        },
      },
    },
    MuiRadio: {
      styleOverrides: {
        root: {
          padding: 10,
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          minHeight: 44,
        },
      },
    },
    MuiAlert: {
      defaultProps: {
        variant: "outlined",
      },
      styleOverrides: {
        root: {
          borderRadius: 16,
          alignItems: "center",
        },
        message: {
          lineHeight: 1.55,
        },
      },
    },
    MuiDialog: {
      defaultProps: {
        fullWidth: true,
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontWeight: 800,
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: 20,
        },
      },
    },
    MuiAccordion: {
      defaultProps: {
        disableGutters: true,
        elevation: 0,
      },
      styleOverrides: {
        root: {
          border: "1px solid var(--univai-palette-divider)",
          borderRadius: "16px !important",
          overflow: "hidden",
          "&::before": {
            display: "none",
          },
          "& + &": {
            marginTop: 12,
          },
        },
      },
    },
    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          minHeight: 58,
          paddingInline: 20,
          "&.Mui-expanded": {
            minHeight: 58,
          },
        },
        content: {
          marginBlock: 16,
          "&.Mui-expanded": {
            marginBlock: 16,
          },
        },
      },
    },
    MuiAccordionDetails: {
      styleOverrides: {
        root: {
          padding: "0 20px 20px",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 800,
          color: "var(--univai-palette-text-primary)",
          backgroundColor:
            "color-mix(in srgb, var(--univai-palette-primary-main) 7%, var(--univai-palette-background-paper))",
        },
        root: {
          borderColor: "var(--univai-palette-divider)",
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          minHeight: 46,
          borderRadius: 12,
          "&.Mui-selected": {
            color: "var(--univai-palette-primary-main)",
            backgroundColor:
              "color-mix(in srgb, var(--univai-palette-primary-main) 10%, transparent)",
          },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          minHeight: 44,
          borderRadius: 10,
          marginInline: 6,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          height: 8,
          borderRadius: 999,
        },
        bar: {
          borderRadius: 999,
        },
      },
    },
    MuiTooltip: {
      defaultProps: {
        arrow: true,
        enterDelay: 450,
      },
      styleOverrides: {
        tooltip: {
          borderRadius: 10,
          fontSize: "0.78rem",
          padding: "8px 10px",
        },
      },
    },
  },
  });
}

const theme = createAppTheme();

export default theme;
