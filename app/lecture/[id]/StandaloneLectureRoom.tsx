"use client";

import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

const segments = [
  "Reliable answers cite the supplied learning material.",
  "Tenant filtering keeps each learner's records separate.",
  "Explicit modes prevent fixtures from appearing in production.",
];

type State =
  | "connecting"
  | "preparing"
  | "lecturing"
  | "asking"
  | "listening"
  | "review"
  | "answering"
  | "ended";

export default function StandaloneLectureRoom({ lectureId }: { lectureId: number }) {
  const [state, setState] = useState<State>("connecting");
  const [slide, setSlide] = useState(1);
  const [hand, setHand] = useState(false);
  const [question, setQuestion] = useState("");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);

  useEffect(() => {
    const preparing = setTimeout(() => setState("preparing"), 100);
    const lecturing = setTimeout(() => setState("lecturing"), 300);
    const second = setTimeout(() => setSlide(2), 900);
    const third = setTimeout(() => setSlide(3), 1500);
    return () => {
      clearTimeout(preparing);
      clearTimeout(lecturing);
      clearTimeout(second);
      clearTimeout(third);
    };
  }, []);

  function raiseHand() {
    setHand(true);
    setState("asking");
    setTimeout(() => setState("listening"), 150);
  }

  function reviewQuestion() {
    const heard = question.trim() || "What protects each learner's material?";
    setTranscript(heard);
    setState("review");
  }

  function sendQuestion() {
    setState("answering");
    setTimeout(() => {
      const known = (transcript ?? "").toLowerCase().includes("learner");
      setAnswer(
        known
          ? "Tenant filtering keeps each learner's material separate. See page 2."
          : "That is not covered in the standalone learning material."
      );
      setHand(false);
      setTranscript(null);
      setState("lecturing");
    }, 250);
  }

  return (
    <Stack spacing={3}>
      <Alert severity="warning">
        Standalone lecture simulation. Audio is silent and speech recognition is scripted.
      </Alert>
      <Grid container spacing={1}>
        <Grid><Chip label={`lecture ${lectureId}`} /></Grid>
        <Grid><Chip color="primary" label={state} /></Grid>
        <Grid><Chip variant="outlined" label={`slide ${slide}`} /></Grid>
      </Grid>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h4">Stable standalone contracts</Typography>
            <Typography>{segments[slide - 1]}</Typography>
            <Typography variant="caption">Project-authored fixture, page {slide}</Typography>
          </Stack>
        </CardContent>
      </Card>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Button variant="contained" onClick={raiseHand} disabled={hand || state === "ended"}>
              {hand ? "Hand raised" : "Raise hand"}
            </Button>
            {state === "listening" ? (
              <>
                <TextField
                  label="Scripted question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                />
                <Button variant="outlined" onClick={reviewQuestion}>Finish speaking</Button>
              </>
            ) : null}
            {state === "review" ? (
              <>
                <TextField
                  label="Review transcript"
                  value={transcript ?? ""}
                  onChange={(event) => setTranscript(event.target.value)}
                />
                <Button variant="contained" onClick={sendQuestion}>Send question</Button>
              </>
            ) : null}
            {answer ? <Alert severity="info">{answer}</Alert> : null}
            <Button variant="outlined" onClick={() => setState("ended")}>Complete lecture</Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
