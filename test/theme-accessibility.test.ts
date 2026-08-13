import { describe, expect, it } from "vitest";
import { getContrastRatio } from "@mui/material/styles";
import { createAppTheme } from "@/app/theme";

describe("accessibility theme foundations", () => {
  it("keeps normal light-mode text tokens at AAA contrast on app surfaces", () => {
    const theme = createAppTheme("ltr");
    const light = (
      theme as unknown as {
        colorSchemes: {
          light: {
            palette: {
              text: { primary: string; secondary: string };
              background: { default: string; paper: string };
              primary: { main: string };
              secondary: { main: string };
            };
          };
        };
      }
    ).colorSchemes.light.palette;

    expect(getContrastRatio(light.text.primary, light.background.default)).toBeGreaterThanOrEqual(7);
    expect(getContrastRatio(light.text.secondary, light.background.default)).toBeGreaterThanOrEqual(7);
    expect(getContrastRatio(light.primary.main, light.background.paper)).toBeGreaterThanOrEqual(7);
    expect(getContrastRatio(light.secondary.main, light.background.paper)).toBeGreaterThanOrEqual(7);
  });

  it("creates a true RTL theme and 44px minimum targets for compact controls", () => {
    const theme = createAppTheme("rtl");

    expect(theme.direction).toBe("rtl");
    expect(theme.components?.MuiButton?.styleOverrides?.sizeSmall).toMatchObject({
      minHeight: 44,
    });
    expect(theme.components?.MuiIconButton?.styleOverrides?.root).toMatchObject({
      width: 44,
      height: 44,
    });
    expect(theme.components?.MuiMenuItem?.styleOverrides?.root).toMatchObject({
      minHeight: 44,
    });
  });
});
