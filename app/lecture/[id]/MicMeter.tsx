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

/** Local feedback only; the worker uses probabilistic VAD for the real decision. */
const SPEECH_THRESHOLD = 0.008;

type Props = {
  track: LocalAudioTrack | null;
  muted: boolean;
  phase?: "idle" | "listening" | "processing" | "review";
};

export default function MicMeter({ track, muted, phase = "idle" }: Props) {
  const [level, setLevel] = useState(0);
  const [hearing, setHearing] = useState(false);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const mediaTrack = track?.mediaStreamTrack;
    if (!mediaTrack || muted || phase === "processing" || phase === "review") {
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
    context.resume().catch(() => undefined);

    const samples = new Float32Array(analyser.fftSize);
    let lastUpdate = 0;

    const tick = (now: number) => {
      if (now - lastUpdate < 80) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      lastUpdate = now;
      analyser.getFloatTimeDomainData(samples);

      // Root-mean-square: the level the ear actually perceives.
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const rms = Math.sqrt(sum / samples.length);

      const nextHearing = rms > SPEECH_THRESHOLD;
      const nextLevel = Math.min(100, rms * 900);
      setHearing((previous) => (previous === nextHearing ? previous : nextHearing));
      setLevel((previous) => (Math.abs(previous - nextLevel) < 1 ? previous : nextLevel));

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      source.disconnect();
      context.close().catch(() => undefined);
    };
  }, [track, muted, phase]);

  const paused = phase === "processing" || phase === "review";

  return (
    <Stack spacing={1}>
      <Grid container spacing={1}>
        <Grid>
          <Chip
            size="small"
            color={paused || muted ? "default" : hearing ? "secondary" : "primary"}
            variant={!paused && hearing ? "filled" : "outlined"}
            label={
              phase === "processing"
                ? "speech received"
                : phase === "review"
                  ? "microphone paused"
                  : muted
                    ? "microphone off"
                    : hearing
                      ? "hearing you"
                      : "microphone on"
            }
          />
        </Grid>
      </Grid>

      <LinearProgress
        variant="determinate"
        value={muted || paused ? 0 : level}
        color={hearing ? "secondary" : "primary"}
      />

      <Typography variant="caption" color="text.secondary">
        {phase === "processing"
          ? "Your microphone is paused while speech recognition finishes."
          : phase === "review"
            ? "Review the transcript below. Your microphone is not recording."
            : muted
              ? phase === "listening"
                ? "Start the microphone when you are ready to speak."
                : "Raise your hand first. Nothing is sent while the microphone is off."
          : hearing
            ? "Keep talking. When you stop, you will see what we heard before it is sent."
            : "Start speaking. The activity bar should move with your voice."}
      </Typography>
    </Stack>
  );
}
