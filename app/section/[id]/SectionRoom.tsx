"use client";

import { useCallback, useEffect, useState } from "react";
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

type SectionInfo = { id: string; week: number; title: string; totalMinutes: number; objectives: string[] };
type SectionEvent = { type: string; payload?: Record<string, unknown> };

export default function SectionRoom({ sectionId }: { sectionId: string }) {
  const [room] = useState(() => new Room({ adaptiveStream: true }));
  const [section, setSection] = useState<SectionInfo | null>(null);
  const [event, setEvent] = useState<SectionEvent | null>(null);
  const [content, setContent] = useState<Record<string, unknown> | null>(null);
  const [todos, setTodos] = useState<Array<Record<string, unknown>>>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);

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
            if (message.payload?.content && typeof message.payload.content === "object") {
              setContent(message.payload.content as Record<string, unknown>);
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

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!section) return <CircularProgress />;
  const payload = event?.payload ?? {};
  const completed = event?.type === "section_state" && payload.state === "completed";
  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="overline">Week {section.week} · {section.totalMinutes} min</Typography>
        <Typography variant="h4">{section.title}</Typography>
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
        <List>{section.objectives.map((objective) => <ListItem key={objective}><ListItemText primary={objective} /></ListItem>)}</List>
      </CardContent></Card>
      {completed ? <Alert severity="success">Section completed.</Alert> : null}
      {content ? (
        <Card variant="outlined"><CardContent><Stack spacing={2}>
          <Typography variant="h6">{String(content.title ?? content.prompt ?? content.step ?? "Guided practice")}</Typography>
          <Typography>{String(content.description ?? content.explanation ?? content.conclusion ?? "")}</Typography>
          {event?.type === "section_state" && payload.state === "waiting" ? (
            <><TextField multiline minRows={4} label="Your answer" value={answer} onChange={(change) => setAnswer(change.target.value)} />
            <Button
              variant="contained"
              disabled={!answer.trim()}
              onClick={() => send({
                type: "section_submit",
                submission_id: crypto.randomUUID(),
                activity_index: Number(payload.activity_index ?? 0),
                text: answer,
              }).then(() => setAnswer(""))}
            >
              Submit answer
            </Button></>
          ) : null}
        </Stack></CardContent></Card>
      ) : null}
      {todos.length ? <Card variant="outlined"><CardContent><Stack spacing={2}>
        <Typography variant="h6">Next actions</Typography>
        {todos.map((todo, index) => <Button key={index} variant="outlined" disabled={completed} onClick={() => send({ type: "todo_ack", todo_index: index })}>{String(todo.text ?? `Task ${index + 1}`)}</Button>)}
        <Button variant="contained" disabled={completed} onClick={() => send({ type: "section_complete" })}>Complete section</Button>
      </Stack></CardContent></Card> : null}
    </Stack>
  );
}
