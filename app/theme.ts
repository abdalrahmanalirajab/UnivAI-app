import { createTheme } from "@mui/material/styles";

const focusRing = {
  outline: "2px solid var(--univai-palette-secondary-main)",
  outlineOffset: 3,
};

const theme = createTheme({
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
          main: "#0F766E",
          dark: "#115E59",
          contrastText: "#FFFFFF",
        },
        background: {
          default: "#F7F7FB",
          paper: "#FFFFFF",
        },
        text: {
          primary: "#172033",
          secondary: "#566074",
        },
        divider: "rgba(42, 49, 80, 0.14)",
        success: {
          main: "#257A54",
          dark: "#155E3F",
        },
        warning: {
          main: "#A35B00",
          dark: "#7A4200",
        },
        error: {
          main: "#B42318",
          dark: "#8E1B12",
        },
        info: {
          main: "#176B9B",
          dark: "#0E527B",
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
      'var(--font-univai), "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    h1: {
      fontSize: "clamp(2.75rem, 7vw, 5.75rem)",
      fontWeight: 800,
      letterSpacing: "-0.055em",
      lineHeight: 0.98,
    },
    h2: {
      fontSize: "clamp(2rem, 4vw, 3.5rem)",
      fontWeight: 800,
      letterSpacing: "-0.04em",
      lineHeight: 1.05,
    },
    h3: {
      fontSize: "clamp(1.45rem, 2.4vw, 2.25rem)",
      fontWeight: 750,
      letterSpacing: "-0.025em",
      lineHeight: 1.15,
    },
    h4: {
      fontSize: "1.4rem",
      fontWeight: 750,
      letterSpacing: "-0.018em",
      lineHeight: 1.2,
    },
    h5: {
      fontWeight: 750,
      letterSpacing: "-0.014em",
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
      letterSpacing: "-0.005em",
    },
    overline: {
      fontWeight: 800,
      letterSpacing: "0.12em",
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
        "a:focus-visible, button:focus-visible, [role='button']:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible":
          focusRing,
        ".skip-link": {
          position: "fixed",
          zIndex: 2000,
          top: 12,
          left: 12,
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
        ".standalone-notice": {
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
        ".brand-mark": {
          width: 38,
          height: 38,
          color: "var(--univai-palette-primary-contrastText)",
          background:
            "linear-gradient(135deg, var(--univai-palette-primary-main), var(--univai-palette-secondary-main))",
          boxShadow:
            "0 8px 18px color-mix(in srgb, var(--univai-palette-primary-main) 24%, transparent)",
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
          marginLeft: "auto !important",
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
        ".landing-main": {
          overflow: "hidden",
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
          right: -120,
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
          left: 18,
          right: 18,
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
          right: 18,
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
          borderLeft: "1px solid var(--univai-palette-divider)",
          backgroundColor: "var(--univai-palette-background-paper)",
        },
        ".source-answer": {
          borderLeft: "4px solid var(--univai-palette-secondary-main)",
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
          marginLeft: "auto !important",
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
        ".family-guardrail": {
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
          left: "8%",
          right: "8%",
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
          right: -80,
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
          ".lecture-sidebar": {
            borderLeft: 0,
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
          ".hero-float-chip": {
            top: 12,
            right: 12,
          },
          ".final-cta": {
            padding: 32,
            borderRadius: 24,
          },
          ".voice-status-chip": {
            width: "100%",
            marginLeft: "0 !important",
          },
          ".footer-bottom": {
            alignItems: "flex-start",
          },
        },
        "@media (prefers-reduced-motion: reduce)": {
          html: {
            scrollBehavior: "auto",
          },
          "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            animationIterationCount: "1 !important",
            scrollBehavior: "auto !important",
            transitionDuration: "0.01ms !important",
          },
        },
      }),
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          color: "var(--univai-palette-text-primary)",
          backgroundColor:
            "color-mix(in srgb, var(--univai-palette-background-default) 88%, transparent)",
          backgroundImage: "none",
          borderBottom: "1px solid var(--univai-palette-divider)",
          backdropFilter: "blur(18px)",
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
          minHeight: 36,
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

export default theme;
