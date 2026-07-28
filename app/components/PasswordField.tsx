"use client";

import { useState } from "react";
import TextField from "@mui/material/TextField";
import type { TextFieldProps } from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";

export default function PasswordField(props: TextFieldProps) {
  const [visible, setVisible] = useState(false);
  const { slotProps, ...rest } = props;

  // MUI v9: the old `InputProps` is gone — the input slot is set via
  // `slotProps.input`. Merge any caller-provided input slot props under ours.
  const callerInput =
    slotProps && typeof slotProps.input === "object" ? slotProps.input : {};

  return (
    <TextField
      {...rest}
      type={visible ? "text" : "password"}
      slotProps={{
        ...slotProps,
        input: {
          ...callerInput,
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                aria-label="toggle password visibility"
                onClick={() => setVisible((v) => !v)}
                edge="end"
                tabIndex={-1}
              >
                {visible ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}