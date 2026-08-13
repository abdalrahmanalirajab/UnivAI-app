"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import OutputFeedback from "@/app/components/OutputFeedback";
import type { AiOutputTarget } from "@/lib/ai-output-feedback-types";

type SectionInfo = {
  id: string;
  week: number;
  title: string;
  totalMinutes: number;
  objectives: string[];
  feedbackTarget: AiOutputTarget;
};
type SectionEvent = { type: string; payload?: Record<string, unknown> };

/** One step of the section, kept for the rest of the visit once it arrives. */
type SectionStep = {
  key: string;
  title: string;
  body: string;
  activityIndex: number;
  answer: string | null;
};

function stepTitle(content: Record<string, unknown>): string {
  return String(content.title ?? content.prompt ?? content.step ?? "Guided practice");
}

function stepBody(content: Record<string, unknown>): string {
  return String(content.description ?? content.explanation ?? content.conclusion ?? "");
}

export default function SectionRoom({ sectionId }: { sectionId: string }) {
  const [room] = useState(() => new Room({ adaptiveStream: true }));
  const [section, setSection] = useState<SectionInfo | null>(null);
  const [event, setEvent] = useState<SectionEvent | null>(null);
  // A section is a worked sequence: every step stays on the page under the one
  // before it, so a learner can look back at what they already answered.
  const [steps, setSteps] = useState<SectionStep[]>([]);
  const [todos, setTodos] = useState<Array<Record<string, unknown>>>([]);
  const [acknowledged, setAcknowledged] = useState<number[]>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const latestStep = useRef<HTMLDivElement | null>(null);

  const send = useCallback((value: Record<string, unknown>) => {
    return room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(value)),
      { reliable: true },
    );
  }, [room]);

  useEffect(() => {
    let audio: HTMLAudioElement | null = null;
    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          audio = track.attach();
          document.body.appendChild(audio);
          audio.play().catch(() => undefined);
        }
      })
      .on(RoomEvent.DataReceived, (bytes: Uint8Array) => {
        try {
          const message = JSON.parse(new TextDecoder().decode(bytes)) as SectionEvent;
          if (message.type === "section_ready") setReady(true);
          else {
            const content = message.payload?.content;
            if (content && typeof content === "object") {
              const record = content as Record<string, unknown>;
              const activityIndex = Number(message.payload?.activity_index ?? 0);
              const key = `${activityIndex}:${stepTitle(record)}`;
              setSteps((previous) =>
                previous.some((step) => step.key === key)
                  ? previous
                  : [
                      ...previous,
                      {
                        key,
                        title: stepTitle(record),
                        body: stepBody(record),
                        activityIndex,
                        answer: null,
                      },
                    ],
              );
            }
            if (Array.isArray(message.payload?.todos)) {
              setTodos(message.payload.todos as Array<Record<string, unknown>>);
            }
            setEvent(message);
          }
        } catch { /* fail closed on malformed worker data */ }
      });

    fetch(`/api/section/${sectionId}/token`, { method: "POST" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not join the section.");
        setSection(body.section);
        await room.connect(body.url, body.token);
      })
      .catch((reason: Error) => setError(reason.message));

    return () => {
      room.disconnect();
      audio?.remove();
    };
  }, [room, sectionId]);

  // Keep the newest step in view without stealing the page from a learner who
  // has scrolled back to re-read an earlier one.
  useEffect(() => {
    latestStep.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [steps.length]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!section) return <CircularProgress />;
  const payload = event?.payload ?? {};
  const completed = event?.type === "section_state" && payload.state === "completed";
  const awaitingAnswer = event?.type === "section_state" && payload.state === "waiting";
  const openActivity = Number(payload.activity_index ?? 0);

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="overline">Week {section.week} · {section.totalMinutes} min</Typography>
        <Typography variant="h4" data-generated-content="true" lang="en" dir="ltr">
          {section.title}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Chip label={ready ? "Live" : "Connecting"} color={ready ? "success" : "default"} />
          <Button
            size="small"
            variant={audioEnabled ? "outlined" : "contained"}
            disabled={!ready || audioEnabled}
            onClick={() => room.startAudio()
              .then(() => setAudioEnabled(true))
              .catch(() => setError("Your browser blocked section audio. Allow audio and try again."))}
          >
            {audioEnabled ? "Audio enabled" : "Enable audio"}
          </Button>
        </Stack>
      </Stack>

      <Card variant="outlined"><CardContent>
        <Typography variant="h6">Objectives</Typography>
        <List data-generated-content="true" lang="en" dir="ltr">
          {section.objectives.map((objective) => <ListItem key={objective}><ListItemText primary={objective} /></ListItem>)}
        </List>
      </CardContent></Card>

      <Card variant="outlined"><CardContent>
        <OutputFeedback target={section.feedbackTarget} />
      </CardContent></Card>

      {steps.map((step, index) => {
        const isLatest = index === steps.length - 1;
        const takesAnswer = isLatest && awaitingAnswer && !completed;
        return (
          <Card key={step.key} variant="outlined" ref={isLatest ? latestStep : undefined}>
            <CardContent><Stack spacing={2}>
              <Typography variant="overline" color="text.secondary">Step {index + 1}</Typography>
              <Typography variant="h6" data-generated-content="true" lang="en" dir="ltr">
                {step.title}
              </Typography>
              {step.body ? (
                <Typography data-generated-content="true" lang="en" dir="ltr">
                  {step.body}
                </Typography>
              ) : null}
              {step.answer ? (
                <Alert severity="success" variant="outlined">
                  <Typography variant="subtitle2">Your answer</Typography>
                  <Typography variant="body2" data-no-ui-translate="true" dir="auto">
                    {step.answer}
                  </Typography>
                </Alert>
              ) : null}
              {takesAnswer ? (
                <>
                  <TextField
                    multiline
                    minRows={4}
                    label="Your answer"
                    value={answer}
                    onChange={(change) => setAnswer(change.target.value)}
                  />
                  <Button
                    variant="contained"
                    disabled={!answer.trim()}
                    onClick={() => {
                      const submitted = answer;
                      send({
                        type: "section_submit",
                        submission_id: crypto.randomUUID(),
                        activity_index: openActivity,
                        text: submitted,
                      }).then(() => {
                        // Keep the answer beside the step it belongs to.
                        setSteps((previous) =>
                          previous.map((item) =>
                            item.key === step.key ? { ...item, answer: submitted } : item,
                          ),
                        );
                        setAnswer("");
                      });
                    }}
                  >
                    Submit answer
                  </Button>
                </>
              ) : null}
            </Stack></CardContent>
          </Card>
        );
      })}

      {todos.length ? <Card variant="outlined"><CardContent><Stack spacing={2}>
        <Typography variant="h6">Next actions</Typography>
        <Typography variant="body2" color="text.secondary">
          Practice to do on your own. Mark each one once you have worked through it.
        </Typography>
        {todos.map((todo, index) => {
          const done = acknowledged.includes(index);
          return (
            <Button
              key={index}
              data-generated-content="true"
              lang="en"
              dir="ltr"
              variant={done ? "contained" : "outlined"}
              color={done ? "success" : "primary"}
              disabled={completed || done}
              onClick={() => {
                send({ type: "todo_ack", todo_index: index });
                setAcknowledged((previous) =>
                  previous.includes(index) ? previous : [...previous, index],
                );
              }}
            >
              {done ? "✓ " : ""}{String(todo.text ?? `Task ${index + 1}`)}
            </Button>
          );
        })}
        <Button variant="contained" disabled={completed} onClick={() => send({ type: "section_complete" })}>
          Complete section
        </Button>
      </Stack></CardContent></Card> : null}

      {completed ? (
        <Alert
          severity="success"
          action={
            <Button href="/start" color="inherit" variant="outlined">
              Continue
            </Button>
          }
        >
          Section completed.
        </Alert>
      ) : null}
    </Stack>
  );
}
