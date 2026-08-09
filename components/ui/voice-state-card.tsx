"use client";

import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import GraphicEqRounded from "@mui/icons-material/GraphicEqRounded";

type Props = {
  label: string;
  title: string;
  detail: string;
  active?: boolean;
  problem?: string | null;
};

export default function VoiceStateCard({
  label,
  title,
  detail,
  active = false,
  problem = null,
}: Props) {
  return (
    <Paper className="voice-state-card" elevation={0} aria-live="polite">
      <Stack spacing={2}>
        <Stack direction="row" spacing={1.5} className="align-center">
          <Avatar
            variant="rounded"
            className={active ? "voice-state-icon voice-state-icon-active" : "voice-state-icon"}
          >
            <GraphicEqRounded />
          </Avatar>
          <Stack spacing={0.25}>
            <Chip size="small" color="secondary" label={label} className="voice-state-label" />
            <Typography variant="h6">{title}</Typography>
          </Stack>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {detail}
        </Typography>
        {active ? <LinearProgress color="secondary" aria-label={title} /> : null}
        {problem ? <Alert severity="warning">{problem}</Alert> : null}
      </Stack>
    </Paper>
  );
}
