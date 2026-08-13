"use client";

import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import PanToolAltOutlined from "@mui/icons-material/PanToolAltOutlined";
import content from "./content";
import SyncedVoicePlayer from "./SyncedVoicePlayer";

export default function RaiseHandTeaser() {
  const { raiseHandTeaser } = content;
  const [raised, setRaised] = useState(false);
  const [displayedText, setDisplayedText] = useState("");

  const handleRaiseHand = () => {
    if (raised) return;
    setDisplayedText("");
    setRaised(true);
  };

  useEffect(() => {
    if (!raised) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion) {
      setDisplayedText(raiseHandTeaser.fullAnswer);
      return;
    }

    const timer = window.setTimeout(() => {
      setDisplayedText(raiseHandTeaser.fullAnswer);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [raised, raiseHandTeaser.fullAnswer]);

  const complete = displayedText.length === raiseHandTeaser.fullAnswer.length;

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="overline" color="secondary">
          {raiseHandTeaser.label}
        </Typography>
        <Typography variant="body2" data-no-ui-translate="true" dir="ltr">
          {raiseHandTeaser.sampleQuestion}
        </Typography>
      </Stack>

      <Button
        variant={raised ? "outlined" : "contained"}
        color="secondary"
        startIcon={<PanToolAltOutlined />}
        onClick={handleRaiseHand}
        disabled={raised}
      >
        {raised ? "Question sent" : raiseHandTeaser.buttonLabel}
      </Button>

      <Collapse in={raised}>
        <Stack spacing={1.5}>
          {!complete ? (
            <Stack spacing={0.75} role="status" aria-live="polite">
              <Typography variant="caption" color="text.secondary">
                {raiseHandTeaser.workingLabel}
              </Typography>
              <LinearProgress color="secondary" />
            </Stack>
          ) : null}
          <Card className="source-answer">
            <CardContent>
              <Stack spacing={1.5}>
                <Chip
                  size="small"
                  color="success"
                  variant="outlined"
                  icon={<AutoAwesomeOutlined />}
                  label={
                    complete
                      ? raiseHandTeaser.answeredLabel
                      : "Preparing answer"
                  }
                  className="eyebrow-chip"
                />
                <Typography
                  variant="body2"
                  color="text.secondary"
                  aria-live="polite"
                  data-generated-content="true"
                  lang="en"
                  dir="ltr"
                >
                  {complete ? null : displayedText}
                </Typography>
                {complete ? (
                  <>
                    <SyncedVoicePlayer answer={raiseHandTeaser.fullAnswer} />
                    <Alert severity="info" icon={false}>
                      {raiseHandTeaser.sourceText}
                    </Alert>
                  </>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Collapse>
    </Stack>
  );
}
