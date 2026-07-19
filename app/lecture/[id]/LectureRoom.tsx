"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  type LocalAudioTrack,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Typography from "@mui/material/Typography";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import PanToolAltIcon from "@mui/icons-material/PanToolAlt";
import MicMeter from "./MicMeter";
import TranscriptReview from "./TranscriptReview";
import { formatLateness } from "@/lib/time";

/**
 * The live lecture room.
 *
 * Uses livekit-client directly, not @livekit/components-react: that package
 * ships its own stylesheet, and this app is pure MUI with no CSS.
 *
 * Two agents share the room with the student:
 *   Lecturer — speaks the premade script (TTS) and drives the slides
 *   Listener — hears the student, and interrupts the Lecturer when they speak
 */

type AgentState =
  | "connecting"
  | "preparing"
  | "lecturing"
  | "asking"
  | "listening"
  | "review"
  | "answering"
  | "ended";

const STATE_LABEL: Record<AgentState, string> = {
  connecting: "Connecting…",
  preparing: "Loading the lecturer's voice…",
  lecturing: "Lecturer speaking",
  asking: "Lecturer is asking you…",
  listening: "Listening to you…",
  review: "Paused — check your question",
  answering: "Answering your question",
  ended: "Lecture finished",
};

const STATE_COLOR: Record<AgentState, "default" | "primary" | "secondary" | "success"> = {
  connecting: "default",
  preparing: "default",
  lecturing: "primary",
  asking: "secondary",
  listening: "secondary",
  review: "secondary",
  answering: "secondary",
  ended: "success",
};

/** The answer pipeline as fixed stepper stages, in the order the worker reports them. */
const ANSWER_STAGES: { key: string; label: string }[] = [
  { key: "retrieving", label: "Searching the book" },
  { key: "retrieved", label: "Passages found" },
  { key: "thinking", label: "Writing the answer" },
  { key: "answered", label: "Answer ready" },
  { key: "speaking", label: "Speaking" },
];

const JOURNEY_HINT: Record<number, string> = {
  1: "The lecturer finishes the sentence, then asks you by name.",
  2: "Your microphone is unlocked — unmute and speak.",
  3: "Check the transcript below — edit it or send it as is.",
};

type Props = { lectureId: number };

export default function LectureRoom({ lectureId }: Props) {
  const [room] = useState(() => new Room({ adaptiveStream: true }));
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The mic starts MUTED: a student should never be broadcast without asking for it,
  // and an open mic on join would let a cough interrupt the lecture immediately.
  const [muted, setMuted] = useState(true);
  const [agentState, setAgentState] = useState<AgentState>("connecting");
  const [slide, setSlide] = useState(1);
  const [week, setWeek] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [attendance, setAttendance] = useState<{ status: string; lateMinutes: number } | null>(null);
  const [lastAnswer, setLastAnswer] = useState<{ question: string; answer: string; pages: number[] } | null>(null);
  // What Whisper heard, waiting for the student to confirm or correct it.
  const [transcript, setTranscript] = useState<string | null>(null);
  // The raise-hand protocol: nobody unmutes unannounced. Raise your hand, the
  // lecturer finishes the sentence and asks you by name, THEN the mic unlocks.
  const [hand, setHand] = useState<"idle" | "raised" | "acked">("idle");
  // Live trace of where the answer currently is (retrieval -> model -> speech),
  // so a slow step reads as "working on X for Ns", never as a frozen page.
  const [steps, setSteps] = useState<{ stage: string; detail: string }[]>([]);
  // Chrome refuses to play audio on a page the user has not interacted with. The
  // lecture page auto-joins, so there is no gesture and the lecturer is silently
  // muted. LiveKit reports this, and room.startAudio() fixes it — but only from
  // inside a real click handler.
  const [audioBlocked, setAudioBlocked] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const slidesRef = useRef<HTMLIFrameElement | null>(null);
  const micRef = useRef<LocalAudioTrack | null>(null);
  const [mic, setMic] = useState<LocalAudioTrack | null>(null);

  const connect = useCallback(async () => {
    try {
      const res = await fetch(`/api/lecture/${lectureId}/token`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not join the lecture.");

      setWeek(data.lecture.week);
      setTitle(data.lecture.title);
      setAttendance(data.attendance);

      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication) => {
          // The Lecturer's synthesized voice.
          if (track.kind === Track.Kind.Audio && audioRef.current) {
            track.attach(audioRef.current);
            audioRef.current.play().catch(() => setAudioBlocked(true));
          }
        })
        .on(RoomEvent.AudioPlaybackStatusChanged, () => {
          setAudioBlocked(!room.canPlaybackAudio);
        })
        .on(RoomEvent.DataReceived, (payload: Uint8Array) => {
          // Slide sync and status, sent by the voice worker.
          try {
            const message = JSON.parse(new TextDecoder().decode(payload));
            if (message.type === "slide" && typeof message.n === "number") setSlide(message.n);
            if (message.type === "state") {
              setAgentState(message.state as AgentState);
              if (message.state === "answering") setSteps([]);
              // Reaching the end closes the lecture: it cannot be reopened.
              if (message.state === "ended") {
                fetch(`/api/lecture/${lectureId}/complete`, { method: "POST" });
              }
            }
            if (message.type === "answer") setLastAnswer(message.payload);
            if (message.type === "transcript") setTranscript(message.text ?? null);
            if (message.type === "progress") {
              setSteps((previous) => {
                const last = previous[previous.length - 1];
                // The worker can resend a stage (retries, reconnects); showing
                // the same line twice reads as a glitch, not as progress.
                if (last && last.stage === message.stage && last.detail === message.detail) {
                  return previous;
                }
                return [...previous, { stage: message.stage, detail: message.detail }];
              });
            }
            if (message.type === "hand") {
              if (message.state === "acked") setHand("acked");
              if (message.state === "lowered") {
                setHand("idle");
                // Hand time is over: whatever happened, the room goes quiet again.
                const track = micRef.current;
                if (track && !track.isMuted) {
                  track.mute().then(() => {
                    setMuted(true);
                    reply({ type: "mic", muted: true });
                  });
                }
              }
            }
          } catch {
            // A malformed data message must never take the lecture down.
          }
        })
        .on(RoomEvent.Disconnected, () => setConnected(false));

      await room.connect(data.url, data.token);

      const track = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      micRef.current = track;
      setMic(track);
      await track.mute();            // published, but silent until the student unmutes
      await room.localParticipant.publishTrack(track);

      setConnected(true);
      setAgentState("lecturing");
      if (!room.canPlaybackAudio) setAudioBlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the lecture.");
    }
  }, [lectureId, room]);

  useEffect(() => {
    connect();
    return () => {
      room.disconnect();
    };
  }, [connect, room]);

  // The Lecturer agent drives the deck: it sends {slide: n} as each segment
  // begins. Setting the hash on the iframe's own location navigates it; changing
  // the src attribute by hash alone often does not.
  useEffect(() => {
    const frame = slidesRef.current;
    if (!frame?.contentWindow) return;
    try {
      frame.contentWindow.location.hash = `/${slide}`;
    } catch {
      // Different origin (it is not) — fall back to reloading the frame.
      frame.src = `/slides/week-${week}/index.html#/${slide}`;
    }
  }, [slide, week]);

  async function reply(message: Record<string, unknown>) {
    await room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(message)),
      { reliable: true }
    );
    if (message.type === "question" || message.type === "cancel") setTranscript(null);
  }

  async function raiseHand() {
    setHand("raised");
    await room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify({ type: "raise_hand" })),
      { reliable: true }
    );
  }

  async function toggleMute() {
    const track = micRef.current;
    if (!track) return;
    if (muted) {
      await track.unmute();
      setMuted(false);
      reply({ type: "mic", muted: false });
    } else {
      await track.mute();
      setMuted(true);
      reply({ type: "mic", muted: true });
    }
  }

  if (error) {
    return (
      <Stack spacing={2}>
        <Alert severity="error">
          <AlertTitle>Could not join</AlertTitle>
          {error}
        </Alert>
        <Button variant="contained" onClick={connect}>
          Try again
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4">
          {week ? `Week ${week} — ${title}` : "Lecture"}
        </Typography>
        <Grid container spacing={1}>
          <Grid>
            <Chip color={STATE_COLOR[agentState]} label={STATE_LABEL[agentState]} />
          </Grid>
          <Grid>
            <Chip variant="outlined" label={`slide ${slide}`} />
          </Grid>
          {attendance ? (
            <Grid>
              <Chip
                color={attendance.status === "late" ? "warning" : "success"}
                variant="outlined"
                label={
                  attendance.status === "late"
                    ? `joined ${formatLateness(attendance.lateMinutes)}`
                    : "joined on time"
                }
              />
            </Grid>
          ) : null}
        </Grid>
      </Stack>

      {/* Anything that is actually LOADING looks like loading — never like a
          lecturer silently "speaking". First join after a worker restart can
          take ~30s while the voice models come up. */}
      {!connected || agentState === "connecting" || agentState === "preparing" ? (
        <Stack spacing={1}>
          <LinearProgress />
          {agentState === "preparing" ? (
            <Typography variant="body2" color="text.secondary">
              The lecturer is warming up the voice — this takes up to half a minute
              on the first join. The lecture starts by itself.
            </Typography>
          ) : null}
        </Stack>
      ) : null}

      {audioBlocked ? (
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              variant="outlined"
              onClick={async () => {
                await room.startAudio();
                await audioRef.current?.play().catch(() => undefined);
                setAudioBlocked(!room.canPlaybackAudio);
              }}
            >
              Enable sound
            </Button>
          }
        >
          Your browser has blocked the lecturer&apos;s voice until you click.
        </Alert>
      ) : null}

      <Card variant="outlined">
        <CardContent>
          {week ? (
            <iframe
              key={week}
              ref={slidesRef}
              src={`/slides/week-${week}/index.html#/1`}
              title={`Week ${week} slides`}
              width="100%"
              height="520"
              frameBorder="0"
            />
          ) : (
            <CircularProgress />
          )}
        </CardContent>
      </Card>

      {(hand !== "idle" ||
        transcript !== null ||
        agentState === "listening" ||
        agentState === "review" ||
        agentState === "asking" ||
        agentState === "answering") &&
        (() => {
          const journeyStep =
            agentState === "answering"
              ? 4
              : agentState === "review" || transcript !== null
                ? 3
                : hand === "acked" || agentState === "listening"
                  ? 2
                  : 1;

          // Where the answer currently is, mapped onto the fixed pipeline.
          const reached = steps.filter((step) => step.stage !== "problem");
          const currentStage = reached[reached.length - 1]?.stage ?? "retrieving";
          const answerStep = Math.max(
            0,
            ANSWER_STAGES.findIndex((stage) => stage.key === currentStage)
          );
          const problem = [...steps].reverse().find((step) => step.stage === "problem");
          const detailFor = (key: string) =>
            steps.filter((step) => step.stage === key).pop()?.detail || null;

          return (
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="overline" color="text.secondary">
                    Your question
                  </Typography>
                  <Stepper activeStep={journeyStep} alternativeLabel>
                    {[
                      "Hand raised",
                      "Lecturer calls on you",
                      "Ask your question",
                      "Confirm what I heard",
                      "Answering",
                    ].map((label) => (
                      <Step key={label}>
                        <StepLabel>{label}</StepLabel>
                      </Step>
                    ))}
                  </Stepper>

                  {journeyStep === 4 ? (
                    <Stack spacing={1}>
                      <Stepper activeStep={answerStep} alternativeLabel>
                        {ANSWER_STAGES.map((stage, index) => (
                          <Step key={stage.key} completed={index < answerStep}>
                            <StepLabel
                              error={Boolean(problem) && index === answerStep}
                              optional={
                                detailFor(stage.key) ? (
                                  <Typography variant="caption" color="text.secondary">
                                    {detailFor(stage.key)}
                                  </Typography>
                                ) : null
                              }
                            >
                              {stage.label}
                            </StepLabel>
                          </Step>
                        ))}
                      </Stepper>
                      {problem ? (
                        <Alert severity="warning">{problem.detail || "Hit a problem — recovering."}</Alert>
                      ) : (
                        <LinearProgress />
                      )}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {JOURNEY_HINT[journeyStep] ?? ""}
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          );
        })()}

      {agentState === "ended" && (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Lecture finished 🎓</Typography>
              <Typography variant="body2" color="text.secondary">
                Your attendance is recorded. The quiz for this lecture opens as soon as
                the lecture slot ends — do not miss its 24-hour window.
              </Typography>
              <Grid container spacing={2}>
                <Grid>
                  <Button variant="contained" href="/exams">
                    Go to the exam hall
                  </Button>
                </Grid>
                <Grid>
                  <Button variant="outlined" href="/schedule">
                    Back to the schedule
                  </Button>
                </Grid>
                <Grid>
                  <Button variant="outlined" color="secondary" href="/dashboard">
                    See your dashboard
                  </Button>
                </Grid>
              </Grid>
            </Stack>
          </CardContent>
        </Card>
      )}

      <TranscriptReview
        transcript={transcript}
        onSend={(question) => reply({ type: "question", text: question })}
        onCancel={() => reply({ type: "cancel" })}
      />

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <MicMeter track={mic} muted={muted} />

            <Grid container spacing={2}>
              <Grid>
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<PanToolAltIcon />}
                  onClick={raiseHand}
                  disabled={!connected || hand !== "idle"}
                >
                  {hand === "raised"
                    ? "Hand raised…"
                    : hand === "acked"
                      ? "Lecturer is waiting"
                      : "Raise hand"}
                </Button>
              </Grid>
              <Grid>
                <Button
                  variant="contained"
                  color={muted ? "error" : "primary"}
                  startIcon={muted ? <MicOffIcon /> : <MicIcon />}
                  onClick={toggleMute}
                  disabled={!connected || (muted && hand !== "acked")}
                >
                  {muted ? "Unmute microphone" : "Mute microphone"}
                </Button>
              </Grid>
              <Grid>
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={() => room.disconnect()}
                  disabled={!connected}
                >
                  Leave lecture
                </Button>
              </Grid>
            </Grid>
            <Typography variant="body2" color="text.secondary">
              {hand === "acked"
                ? "The lecturer asked for you — unmute and ask your question."
                : hand === "raised"
                  ? "Hand raised. The lecturer will finish the sentence and ask you."
                  : muted
                    ? "Raise your hand to ask a question — the unmute button unlocks when the lecturer calls on you."
                    : "Ask your question — when you stop talking you can review what we heard."}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {lastAnswer ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1}>
              <Typography variant="overline" color="text.secondary">
                You asked
              </Typography>
              <Typography variant="body1">{lastAnswer.question}</Typography>
              <Typography variant="overline" color="text.secondary">
                Answer
              </Typography>
              <Typography variant="body1">{lastAnswer.answer}</Typography>
              {lastAnswer.pages?.length ? (
                <Grid container spacing={1}>
                  {lastAnswer.pages.map((page) => (
                    <Grid key={page}>
                      <Chip size="small" variant="outlined" label={`p. ${page}`} />
                    </Grid>
                  ))}
                </Grid>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {/* The Lecturer's voice. autoPlay so the lecture starts by itself. */}
      <audio ref={audioRef} autoPlay />
    </Stack>
  );
}
