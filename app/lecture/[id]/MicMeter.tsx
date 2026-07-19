"use client";

import { useEffect, useRef, useState } from "react";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { LocalAudioTrack } from "livekit-client";

/**
 * Shows the student that we are actually hearing them: one level bar that rides
 * their voice, plus a chip that lights up once they are loud enough to interrupt.
 *
 * A real scrolling waveform would need a canvas, and this frontend is MUI-only —
 * so this is a level meter, not a waveform. It answers the same question ("is it
 * catching me?") without inventing custom UI.
 *
 * Muted means the track publishes nothing at all, so the bar sits at zero. That
 * is the honest picture: the Listener agent genuinely cannot hear a word.
 */

/** Matches the Listener agent's VAD: above this, speech interrupts the lecture. */
const SPEECH_THRESHOLD = 0.02;

type Props = { track: LocalAudioTrack | null; muted: boolean };

export default function MicMeter({ track, muted }: Props) {
  const [level, setLevel] = useState(0);
  const [hearing, setHearing] = useState(false);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const mediaTrack = track?.mediaStreamTrack;
    if (!mediaTrack || muted) {
      setLevel(0);
      setHearing(false);
      return;
    }

    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.7;

    const source = context.createMediaStreamSource(new MediaStream([mediaTrack]));
    source.connect(analyser);

    const samples = new Float32Array(analyser.fftSize);

    const tick = () => {
      analyser.getFloatTimeDomainData(samples);

      // Root-mean-square: the level the ear actually perceives.
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const rms = Math.sqrt(sum / samples.length);

      setHearing(rms > SPEECH_THRESHOLD);
      setLevel(Math.min(100, rms * 800)); // scaled so ordinary speech fills most of the bar

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      source.disconnect();
      context.close();
    };
  }, [track, muted]);

  return (
    <Stack spacing={1}>
      <Grid container spacing={1}>
        <Grid>
          <Chip
            size="small"
            color={muted ? "default" : hearing ? "secondary" : "primary"}
            variant={hearing ? "filled" : "outlined"}
            label={muted ? "microphone off" : hearing ? "hearing you" : "microphone on"}
          />
        </Grid>
      </Grid>

      <LinearProgress
        variant="determinate"
        value={muted ? 0 : level}
        color={hearing ? "secondary" : "primary"}
      />

      <Typography variant="caption" color="text.secondary">
        {muted
          ? "Unmute to ask a question. Nothing is being sent while the microphone is off."
          : hearing
            ? "Keep talking. When you stop, you will see what we heard before it is sent."
            : "Speak up to interrupt the lecturer."}
      </Typography>
    </Stack>
  );
}
