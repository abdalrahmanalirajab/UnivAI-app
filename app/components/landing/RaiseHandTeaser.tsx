"use client";

import { useState, useEffect, useRef } from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Collapse from "@mui/material/Collapse";

const SAMPLE_QUESTION = "Can you explain the mitotic phase from Chapter 2?";
const FULL_ANSWER =
  "The mitotic phase consists of prophase, metaphase, anaphase, and telophase. Each chromosome divides into two sister chromatids that are pulled to opposite poles of the cell. — Source: Chapter 2, page 42";
const TYPING_SPEED = 30;

export default function RaiseHandTeaser() {
  const [raised, setRaised] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const indexRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  const handleRaiseHand = () => {
    if (raised) return;
    setRaised(true);
  };

  useEffect(() => {
    if (!raised) {
      setDisplayedText("");
      indexRef.current = 0;
      return;
    }

    if (reducedMotionRef.current) {
      setDisplayedText(FULL_ANSWER);
      return;
    }

    intervalRef.current = setInterval(() => {
      if (indexRef.current < FULL_ANSWER.length) {
        setDisplayedText(FULL_ANSWER.slice(0, indexRef.current + 1));
        indexRef.current += 1;
      } else if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }, TYPING_SPEED);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [raised]);

  return (
    <Paper variant="outlined">
      <Stack spacing={2}>
        <Typography variant="overline" color="text.secondary">
          Live Q&A demo
        </Typography>
        <Paper variant="outlined">
          <Typography variant="body2">{SAMPLE_QUESTION}</Typography>
        </Paper>
        <Button variant="contained" onClick={handleRaiseHand} disabled={raised}>
          Raise your hand
        </Button>
        <Collapse in={raised}>
          <Paper variant="outlined">
            <Typography variant="body2" color="text.secondary">
              {displayedText}
            </Typography>
          </Paper>
        </Collapse>
      </Stack>
    </Paper>
  );
}
