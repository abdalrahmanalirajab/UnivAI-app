"use client";

import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { OutputVersion } from "@/lib/feedback";
import type { LiveAnswerTurn } from "@/lib/live-conversation";
import RaiseHandDock from "./RaiseHandDock";

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
  | "processing"
  | "review"
  | "answering"
  | "ended";

export default function StandaloneLectureRoom({ lectureId }: { lectureId: number }) {
  const turnSequence = useRef(0);
  const [state, setState] = useState<State>("connecting");
  const [slide, setSlide] = useState(1);
  const [hand, setHand] = useState<"idle" | "raised" | "acked">("idle");
  const [muted, setMuted] = useState(true);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [speechState, setSpeechState] = useState<"waiting" | "processing" | "received" | null>(null);
  const [speechDetail, setSpeechDetail] = useState<string | null>(null);
  const [answers, setAnswers] = useState<LiveAnswerTurn[]>([]);
  const [output, setOutput] = useState<OutputVersion | null>(null);

  useEffect(() => {
    const preparing = window.setTimeout(() => setState("preparing"), 100);
    const lecturing = window.setTimeout(() => setState("lecturing"), 300);
    const second = window.setTimeout(() => setSlide(2), 900);
    const third = window.setTimeout(() => setSlide(3), 1_500);
    return () => {
      window.clearTimeout(preparing);
      window.clearTimeout(lecturing);
      window.clearTimeout(second);
      window.clearTimeout(third);
    };
  }, []);

  function raiseHand() {
    setHand("raised");
    setState("asking");
    window.setTimeout(() => setHand("acked"), 500);
  }

  function toggleMicrophone() {
    if (muted) {
      setMuted(false);
      setState("listening");
      setSpeechState("waiting");
      setSpeechDetail("The standalone microphone is simulating your voice.");
      return;
    }

    setMuted(true);
    setState("processing");
    setSpeechState("processing");
    setSpeechDetail("Turning the scripted speech into text.");
    window.setTimeout(() => {
      setTranscript(
        slide === 2
          ? "How is each learner's material kept separate?"
          : "Please explain the current slide more simply.",
      );
      setSpeechState("received");
      setSpeechDetail("Transcript ready. Check it before sending.");
      setState("review");
    }, 350);
  }

  function retryQuestion() {
    setTranscript(null);
    setMuted(false);
    setSpeechState("waiting");
    setSpeechDetail("The standalone microphone is listening again.");
    setState("listening");
  }

  function cancelQuestion() {
    setTranscript(null);
    setMuted(true);
    setHand("idle");
    setSpeechState(null);
    setSpeechDetail(null);
    setState("lecturing");
  }

  function sendQuestion(question: string) {
    setTranscript(null);
    setState("answering");
    setSpeechState(null);
    setSpeechDetail(null);
    window.setTimeout(() => {
      turnSequence.current += 1;
      const turn = turnSequence.current;
      const covered = !question.toLowerCase().includes("weather");
      const answer = covered
        ? `${segments[slide - 1]} In simpler terms, the system applies that rule before sharing any result.`
        : "That is not covered in the standalone learning material.";
      setAnswers((previous) => [
        ...previous,
        {
          id: `standalone-turn-${turn}`,
          question,
          answer,
          pages: covered ? [slide] : [],
          slide,
        },
      ]);
      setOutput({
        id: turn,
        source_qa_id: turn,
        output_version: "1",
        trace_id: `standalone-qa-${turn}-v1`,
        book_id: 4200,
        status: "ready",
        feedbackTarget: {
          targetType: "raise_hand_answer",
          targetId: String(4_200 + turn),
          targetVersion: "1",
          traceId: `standalone-qa-${4_200 + turn}-v1`,
        },
        citations: covered
          ? [{
              documentId: 4200,
              bookTitle: "Project-authored Standalone Course",
              pages: [{ page: slide }],
              excerpt: segments[slide - 1],
            }]
          : [],
        created_at: new Date().toISOString(),
      });
      setMuted(true);
      setHand("idle");
      setState("lecturing");
    }, 350);
  }

  return (
    <Stack spacing={3}>
      <Alert severity="warning">
        Standalone lecture simulation. Audio is silent and speech recognition is scripted.
      </Alert>
      <Grid container spacing={1} className="align-center">
        <Grid><Chip label={`lecture ${lectureId}`} /></Grid>
        <Grid><Chip color="primary" label={state} /></Grid>
        <Grid><Chip variant="outlined" label={`slide ${slide}`} /></Grid>
        <Grid>
          <Button size="small" variant="text" onClick={() => setState("ended")}>
            Complete
          </Button>
        </Grid>
      </Grid>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2} data-generated-content="true" dir="auto">
            <Typography variant="h4">Stable standalone contracts</Typography>
            <Typography>{segments[slide - 1]}</Typography>
            <Typography variant="caption">Project-authored fixture, page {slide}</Typography>
          </Stack>
        </CardContent>
      </Card>

      <RaiseHandDock
        connected
        micBlocked={false}
        mic={null}
        muted={muted}
        hand={hand}
        agentState={state}
        speechState={speechState}
        speechDetail={speechDetail}
        problem={null}
        progressDetail={state === "answering" ? "Preparing the standalone answer..." : null}
        transcript={transcript}
        answers={answers}
        answerOutput={output}
        metadataMessage={null}
        onRaiseHand={raiseHand}
        onToggleMute={toggleMicrophone}
        onRetry={retryQuestion}
        onCancel={cancelQuestion}
        onSend={sendQuestion}
        onDismissProblem={() => undefined}
      />
    </Stack>
  );
}
