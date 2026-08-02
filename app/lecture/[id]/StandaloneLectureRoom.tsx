"use client";

import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CitationBubble from "@/app/components/CitationBubble";
import GenerationStatus from "@/app/components/GenerationStatus";
import OutputFeedback from "@/app/components/OutputFeedback";
import SourcePanel from "@/app/components/SourcePanel";
import type { OutputVersion } from "@/lib/feedback";
import type { CitationV1 } from "@/test/fixtures/citation-v1";

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
  const [output, setOutput] = useState<OutputVersion | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<CitationV1 | null>(null);

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
      setOutput({
        id: 1,
        source_qa_id: 1,
        output_version: "1",
        trace_id: "standalone-qa-1-v1",
        book_id: 4200,
        status: "ready",
        citations: known
          ? [
              {
                documentId: 4200,
                bookTitle: "Project-authored Standalone Course",
                pages: [{ page: 2 }],
                excerpt: segments[1],
              },
            ]
          : [],
        created_at: "2026-07-28T10:30:00.000Z",
      });
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
            {answer ? (
              <Stack spacing={2}>
                <Alert severity="info">{answer}</Alert>
                <GenerationStatus status={output?.status ?? "pending"} />
                {output?.citations.map((citation) => (
                  <CitationBubble
                    key={`${citation.documentId}-${citation.pages[0]?.page}`}
                    citation={citation}
                    expanded={selectedCitation === citation}
                    onOpen={setSelectedCitation}
                  />
                ))}
                <OutputFeedback
                  outputId={output?.id}
                  outputVersion={output?.output_version}
                  traceId={output?.trace_id}
                  bookId={output?.book_id}
                  onRetried={setOutput}
                />
              </Stack>
            ) : null}
            <Button variant="outlined" onClick={() => setState("ended")}>Complete lecture</Button>
          </Stack>
        </CardContent>
      </Card>
      <Drawer
        anchor="right"
        open={selectedCitation !== null}
        onClose={() => setSelectedCitation(null)}
        slotProps={{ paper: { className: "drawer-paper", "aria-label": "Source" } }}
      >
        {selectedCitation ? (
          <SourcePanel citation={selectedCitation} onClose={() => setSelectedCitation(null)} />
        ) : null}
      </Drawer>
    </Stack>
  );
}
