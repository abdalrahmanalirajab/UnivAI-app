"use client";

import { useState } from "react";
import { useColorScheme } from "@mui/material/styles";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import BrightnessAutoOutlined from "@mui/icons-material/BrightnessAutoOutlined";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";

type ColorMode = "system" | "light" | "dark";

const OPTIONS: Array<{
  mode: ColorMode;
  label: string;
  icon: typeof BrightnessAutoOutlined;
}> = [
  { mode: "system", label: "Use device setting", icon: BrightnessAutoOutlined },
  { mode: "light", label: "Light mode", icon: LightModeOutlined },
  { mode: "dark", label: "Dark mode", icon: DarkModeOutlined },
];

export default function ThemeModeMenu() {
  const { mode, setMode } = useColorScheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const currentMode: ColorMode = mode ?? "system";
  const CurrentIcon =
    OPTIONS.find((option) => option.mode === currentMode)?.icon ??
    BrightnessAutoOutlined;

  return (
    <>
      <Tooltip title={`Theme: ${currentMode}`}>
        <IconButton
          aria-label={`Choose color theme. Current setting: ${currentMode}`}
          aria-controls={anchorEl ? "theme-mode-menu" : undefined}
          aria-haspopup="menu"
          aria-expanded={anchorEl ? "true" : undefined}
          onClick={(event) => setAnchorEl(event.currentTarget)}
        >
          <CurrentIcon />
        </IconButton>
      </Tooltip>
      <Menu
        id="theme-mode-menu"
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{ list: { "aria-label": "Color theme" } }}
      >
        {OPTIONS.map((option) => {
          const OptionIcon = option.icon;
          return (
            <MenuItem
              key={option.mode}
              selected={currentMode === option.mode}
              onClick={() => {
                setMode(option.mode);
                setAnchorEl(null);
              }}
            >
              <ListItemIcon>
                <OptionIcon fontSize="small" />
              </ListItemIcon>
              <Typography variant="body2">{option.label}</Typography>
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
