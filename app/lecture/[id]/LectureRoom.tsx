"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  type LocalAudioTrack,
  type RemoteTrack,
} from "livekit-client";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Drawer from "@mui/material/Drawer";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import PanToolAltIcon from "@mui/icons-material/PanToolAlt";
import MicMeter from "./MicMeter";
import TranscriptReview from "./TranscriptReview";
import OutputFeedback from "@/app/components/OutputFeedback";
import CitationBubble from "@/app/components/CitationBubble";
import GenerationStatus from "@/app/components/GenerationStatus";
import SourcePanel from "@/app/components/SourcePanel";
import type { OutputVersion } from "@/lib/feedback";
import type { CitationV1 } from "@/test/fixtures/citation-v1";
import { formatLateness } from "@/lib/time";
import LectureSlides from "./LectureSlides";
import VoiceStateCard from "@/components/ui/voice-state-card";
import { LIVE_SPEECH_STATES, LIVE_STATES } from "@/lib/standalone-contracts";

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

type AgentState = (typeof LIVE_STATES)[number];
type SpeechState = (typeof LIVE_SPEECH_STATES)[number];

const STATE_LABEL: Record<AgentState, string> = {
  connecting: "Connecting…",
  preparing: "Loading the lecturer's voice…",
  waiting: "Waiting for you to reconnect",
  resuming: "Welcoming you back…",
  lecturing: "Lecturer speaking",
  asking: "Lecturer is asking you…",
  listening: "Listening to you…",
  processing: "Turning speech into text…",
  review: "Paused — check your question",
  answering: "Answering your question",
  ended: "Lecture finished",
};

const STATE_COLOR: Record<
  AgentState,
  "default" | "primary" | "secondary" | "success" | "warning"
> = {
  connecting: "default",
  preparing: "default",
  waiting: "warning",
  resuming: "secondary",
  lecturing: "primary",
  asking: "secondary",
  listening: "secondary",
  processing: "secondary",
  review: "secondary",
  answering: "secondary",
  ended: "success",
};

function isAgentState(value: unknown): value is AgentState {
  return typeof value === "string" && (LIVE_STATES as readonly string[]).includes(value);
}

function isSpeechState(value: unknown): value is SpeechState {
  return typeof value === "string" && (LIVE_SPEECH_STATES as readonly string[]).includes(value);
}

type Props = { lectureId: string };

export default function LectureRoom({ lectureId }: Props) {
  const [room] = useState(() => new Room({ adaptiveStream: true }));
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The mic starts MUTED: a student should never be broadcast without asking for it,
  // and an open mic on join would let a cough interrupt the lecture immediately.
  const [muted, setMuted] = useState(true);
  // No microphone was captured (permission denied, or no input device). The
  // lecture still plays; only raising a hand to ask is unavailable.
  const [micBlocked, setMicBlocked] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>("connecting");
  const [slide, setSlide] = useState(1);
  const [week, setWeek] = useState<number | null>(null);
  // The authenticated learner id returned by the token route.
  const [sid, setSid] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [attendance, setAttendance] = useState<{ status: string; lateMinutes: number } | null>(null);
  const [lastAnswer, setLastAnswer] = useState<{ question: string; answer: string; pages: number[] } | null>(null);
  const [answerOutput, setAnswerOutput] = useState<OutputVersion | null>(null);
  const [outputError, setOutputError] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<CitationV1 | null>(null);
  // What Whisper heard, waiting for the student to confirm or correct it.
  const [transcript, setTranscript] = useState<string | null>(null);
  const [voiceFallback, setVoiceFallback] = useState<string | null>(null);
  const [speechState, setSpeechState] = useState<SpeechState | null>(null);
  const [speechDetail, setSpeechDetail] = useState<string | null>(null);
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
  const startupStartedAt = useRef(0);
  const startupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstAudioReported = useRef(false);
  const startupComplete = useRef(false);
  const micRef = useRef<LocalAudioTrack | null>(null);
  const [mic, setMic] = useState<LocalAudioTrack | null>(null);

  const reply = useCallback(async (message: Record<string, unknown>) => {
    try {
      await room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(message)),
        // Heartbeats are current-state signals; stale queued heartbeats after a
        // reconnect are harmful. Learner actions remain reliable.
        { reliable: message.type !== "presence" },
      );
      if (message.type === "question" || message.type === "retry" || message.type === "cancel") {
        setTranscript(null);
        setVoiceFallback(null);
      }
    } catch (publishError) {
      if (message.type !== "presence") {
        setVoiceFallback("The voice connection did not receive that action. Check your connection and try again.");
      }
      throw publishError;
    }
  }, [room]);

  const muteMicrophone = useCallback(async () => {
    const track = micRef.current;
    if (!track) return;
    const alreadyMuted = track.isMuted;
    if (!alreadyMuted) await track.mute();
    setMuted(true);
    if (!alreadyMuted) await reply({ type: "mic", muted: true });
  }, [reply]);

  const connect = useCallback(async () => {
    setError(null);
    startupStartedAt.current = performance.now();
    firstAudioReported.current = false;
    startupComplete.current = false;
    if (startupTimer.current) clearTimeout(startupTimer.current);
    startupTimer.current = setTimeout(() => {
      setError("The lecturer did not start audio within 45 seconds. Please try again.");
    }, 45_000);
    try {
      const res = await fetch(`/api/lecture/${lectureId}/token`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not join the lecture.");

      setWeek(data.lecture.week);
      setSid(data.registrationNumber);
      setTitle(data.lecture.title);
      setAttendance(data.attendance);

      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          // The Lecturer's synthesized voice.
          if (track.kind === Track.Kind.Audio && audioRef.current) {
            track.attach(audioRef.current);
            audioRef.current.play().catch(() => {
              if (startupTimer.current) clearTimeout(startupTimer.current);
              setAudioBlocked(true);
            });
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
            if (message.type === "state" && isAgentState(message.state)) {
              setAgentState(message.state);
              if (message.state === "answering") setSteps([]);
              if (message.state === "listening") {
                setVoiceFallback(null);
                setSteps([]);
              }
              if (
                message.state === "processing" ||
                message.state === "review" ||
                message.state === "answering"
              ) {
                muteMicrophone().catch(() => undefined);
              }
              if (message.state === "lecturing" || message.state === "ended") {
                setSpeechState(null);
                setSpeechDetail(null);
              }
              // A startup failure also closes its worker, but it must not mark
              // a lecture complete before any audio reached the learner.
              if (message.state === "ended" && startupComplete.current) {
                fetch(`/api/lecture/${lectureId}/complete`, { method: "POST" });
              }
            }
            if (message.type === "answer") setLastAnswer(message.payload);
            if (message.type === "transcript") setTranscript(message.text ?? null);
            if (message.type === "speech" && isSpeechState(message.state)) {
              const detail = typeof message.detail === "string" ? message.detail : null;
              setSpeechState(message.state);
              setSpeechDetail(detail);
              if (message.state === "waiting" || message.state === "detected") {
                setVoiceFallback(null);
              }
              if (message.state === "no_speech" || message.state === "error") {
                setVoiceFallback(detail ?? "Voice recognition did not finish.");
              }
              if (message.state === "received") setVoiceFallback(null);
            }
            if (message.type === "fallback") {
              setVoiceFallback(
                message.payload?.detail ??
                  message.payload?.reason ??
                  "Voice recognition could not finish. Type your question instead.",
              );
            }
            if (message.type === "progress") {
              if (message.stage === "problem" && !startupComplete.current) {
                if (startupTimer.current) clearTimeout(startupTimer.current);
                setError(message.detail || "The lecturer could not start. Please try again.");
              }
              if (message.stage === "problem" && startupComplete.current) {
                setVoiceFallback(message.detail || "Voice recognition hit a problem.");
              }
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
                setSpeechState(null);
                setSpeechDetail(null);
                // Hand time is over: whatever happened, the room goes quiet again.
                const track = micRef.current;
                if (track && !track.isMuted) {
                  muteMicrophone().catch(() => undefined);
                }
              }
            }
          } catch {
            // A malformed data message must never take the lecture down.
          }
        })
        .on(RoomEvent.Reconnecting, () => {
          setConnected(false);
          setAgentState("waiting");
        })
        .on(RoomEvent.Reconnected, () => {
          setConnected(true);
          reply({ type: "presence", state: "present" }).catch(() => undefined);
        })
        .on(RoomEvent.Disconnected, () => {
          setConnected(false);
          setAgentState((current) => (current === "ended" ? current : "waiting"));
        });

      await room.connect(data.url, data.token);
      // Participant events provide the fast path. This explicit ready signal
      // also lets the worker detect a half-open browser connection by heartbeat.
      await reply({ type: "presence", state: "present" }).catch(() => undefined);
      setConnected(true);
      setAgentState("preparing");
      if (!room.canPlaybackAudio) setAudioBlocked(true);

      // A microphone is what lets a student ASK; it is not what lets them
      // attend. Denying the permission prompt, or having no input device at
      // all, used to throw here and drop the learner on "Could not join" —
      // locked out of a lecture they only needed to watch and listen to. Failing
      // to capture is therefore a downgrade to listen-only, never a failed join.
      try {
        const track = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
        micRef.current = track;
        setMic(track);
        await track.mute();          // published, but silent until the student unmutes
        await room.localParticipant.publishTrack(track);
      } catch {
        setMicBlocked(true);
      }

    } catch (err) {
      if (startupTimer.current) clearTimeout(startupTimer.current);
      setError(err instanceof Error ? err.message : "Could not join the lecture.");
    }
  }, [lectureId, muteMicrophone, reply, room]);

  useEffect(() => {
    connect();
    return () => {
      if (startupTimer.current) clearTimeout(startupTimer.current);
      if (turnTimer.current) clearTimeout(turnTimer.current);
      reply({ type: "presence", state: "leaving" }).catch(() => undefined);
      room.disconnect();
    };
  }, [connect, reply, room]);

  useEffect(() => {
    if (!connected || agentState === "ended") return;
    const heartbeat = window.setInterval(() => {
      reply({ type: "presence", state: "present" }).catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(heartbeat);
  }, [agentState, connected, reply]);

  useEffect(() => {
    if (turnTimer.current) clearTimeout(turnTimer.current);
    if (agentState === "listening") {
      turnTimer.current = setTimeout(() => {
        setVoiceFallback("Still waiting for speech. Finish the turn or cancel and try again.");
      }, 18_000);
    } else if (agentState === "processing") {
      turnTimer.current = setTimeout(() => {
        setVoiceFallback("Recognition is taking longer than expected. You can cancel without losing your lecture place.");
      }, 15_000);
    }
    return () => {
      if (turnTimer.current) clearTimeout(turnTimer.current);
    };
  }, [agentState]);

  useEffect(() => {
    if (!lastAnswer) {
      setAnswerOutput(null);
      setOutputError(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      for (let attempt = 0; attempt < 5 && !cancelled; attempt += 1) {
        const response = await fetch(`/api/feedback?lectureId=${lectureId}`);
        const body = await response.json().catch(() => ({}));
        if (response.ok && body.output) {
          setAnswerOutput(body.output as OutputVersion);
          setOutputError(null);
          return;
        }
        if (response.status !== 404 || attempt === 4) {
          throw new Error(body.error ?? "Could not load source metadata.");
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    };
    load().catch((loadError) => {
      if (!cancelled) {
        setOutputError(
          loadError instanceof Error ? loadError.message : "Could not load source metadata.",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lastAnswer, lectureId]);

  async function raiseHand() {
    setHand("raised");
    try {
      await reply({ type: "raise_hand" });
    } catch {
      setHand("idle");
    }
  }

  async function toggleMute() {
    const track = micRef.current;
    if (!track) return;
    if (track.isMuted) {
      await track.unmute();
      setMuted(false);
      await reply({ type: "mic", muted: false });
    } else {
      await muteMicrophone();
    }
  }

  async function retrySpeech() {
    const track = micRef.current;
    if (!track) {
      setVoiceFallback("No microphone is available. You can still type your question.");
      return;
    }
    if (track.isMuted) await track.unmute();
    setMuted(false);
    await reply({ type: "mic", muted: false }).catch(() => undefined);
    await reply({ type: "retry" });
  }

  async function cancelQuestion() {
    await muteMicrophone().catch(() => undefined);
    await reply({ type: "cancel" });
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
        <Typography variant="h4" data-generated-content="true" lang="en" dir="ltr">
          {week ? `Week ${week} — ${title}` : "Lecture"}
        </Typography>
        <Grid container spacing={1}>
          <Grid>
            <Chip variant="outlined" label="lecture" />
          </Grid>
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

      {!connected && agentState === "waiting" ? (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" variant="outlined" onClick={() => window.location.reload()}>
              Reconnect
            </Button>
          }
        >
          Your connection was lost. The lecturer is waiting and will welcome you back,
          replay three sentences, and continue from your saved place.
        </Alert>
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
        <CardContent data-generated-content="true" lang="en" dir="ltr">
          {week && sid ? (
            <LectureSlides lectureId={lectureId} slide={slide} />
          ) : (
            <CircularProgress />
          )}
        </CardContent>
      </Card>

      {(hand !== "idle" ||
        transcript !== null ||
        speechState !== null ||
        agentState === "listening" ||
        agentState === "processing" ||
        agentState === "review" ||
        agentState === "asking" ||
        agentState === "answering") &&
        (() => {
          const problem = [...steps].reverse().find((step) => step.stage === "problem");
          const latest = [...steps].reverse().find((step) => step.stage !== "problem");

          if (agentState === "answering") {
            return (
              <VoiceStateCard
                label="Answer in progress"
                title={latest?.detail || "Preparing a grounded answer"}
                detail="Keep this page open. The lecturer will speak the answer and then resume the lesson."
                active={!problem}
                problem={problem?.detail ?? voiceFallback}
              />
            );
          }

          if (agentState === "processing" || speechState === "processing") {
            return (
              <VoiceStateCard
                label="Speech received"
                title="Turning your speech into text"
                detail={speechDetail || "Keep this page open. Your lecture remains paused while recognition finishes."}
                active={!voiceFallback}
                problem={voiceFallback}
              />
            );
          }

          if (agentState === "review" || transcript !== null) {
            const recognitionProblem = speechState === "no_speech" || speechState === "error";
            return (
              <VoiceStateCard
                label={speechState === "received" ? "Transcript received" : "Your question"}
                title={
                  speechState === "error"
                    ? "Voice recognition needs help"
                    : speechState === "no_speech"
                      ? "No clear speech detected"
                      : "Check what I heard"
                }
                detail={
                  speechDetail ||
                  (recognitionProblem
                    ? "The lecture is still paused. Type below, retry the microphone, or discard the turn."
                    : "Edit the transcript below if needed, then send it to the lecturer.")
                }
                problem={recognitionProblem ? voiceFallback : null}
              />
            );
          }

          if (hand === "acked" || agentState === "listening") {
            const heardSpeech = speechState === "detected";
            return (
              <VoiceStateCard
                label={heardSpeech ? "Speech detected" : "Listening"}
                title={heardSpeech ? "I can hear you" : muted ? "Start your microphone" : "Speak now"}
                detail={
                  speechDetail ||
                  "Ask one clear question. Pause or finish speaking, and the transcript will appear for review."
                }
                active={!voiceFallback}
                problem={voiceFallback}
              />
            );
          }

          return (
            <VoiceStateCard
              label="Hand raised"
              title="Waiting for the lecturer"
              detail="The lecturer will finish the current sentence, pause, and call on you."
              active
            />
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
              <Button variant="contained" href="/start">
                Continue
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      <TranscriptReview
        transcript={transcript}
        onSend={(question) => reply({ type: "question", text: question })}
        onRetry={retrySpeech}
        onCancel={cancelQuestion}
      />

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <MicMeter
              track={mic}
              muted={muted}
              phase={
                agentState === "processing"
                  ? "processing"
                  : agentState === "review"
                    ? "review"
                    : agentState === "listening"
                      ? "listening"
                      : "idle"
              }
            />

            <Grid container spacing={2}>
              <Grid>
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<PanToolAltIcon />}
                  onClick={raiseHand}
                  disabled={!connected || micBlocked || hand !== "idle"}
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
                  onClick={() => void toggleMute().catch(() => undefined)}
                  disabled={
                    !connected ||
                    micBlocked ||
                    (muted
                      ? hand !== "acked"
                      : agentState !== "listening")
                  }
                >
                  {muted
                    ? agentState === "listening"
                      ? "Start microphone"
                      : "Microphone paused"
                    : "Finish speaking"}
                </Button>
              </Grid>
              {hand !== "idle" && transcript === null && agentState !== "answering" ? (
                <Grid>
                  <Button
                    variant="outlined"
                    color="secondary"
                    onClick={() => void cancelQuestion().catch(() => undefined)}
                  >
                    Cancel question
                  </Button>
                </Grid>
              ) : null}
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
              {micBlocked
                ? "Listening only — no microphone is available, so you can watch and hear the lecture but not ask aloud. Allow microphone access and rejoin to raise your hand."
                : agentState === "processing"
                  ? "Speech received. The microphone is paused while recognition finishes."
                  : agentState === "review"
                    ? "Check the transcript, retry the microphone, type the question, or discard it."
                    : hand === "acked"
                      ? "The lecturer asked for you — start the microphone and ask your question."
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
              <Typography
                variant="body1"
                data-generated-content="true"
                lang="en"
                dir="ltr"
              >
                {lastAnswer.answer}
              </Typography>
              <GenerationStatus
                status={answerOutput?.status ?? (outputError ? "failed" : "pending")}
                progress={
                  answerOutput?.status === "generating"
                    ? "Creating a new version; the previous answer remains available."
                    : outputError
                      ? outputError
                      : "Loading source and output identity…"
                }
              />
              {(answerOutput?.citations.length || lastAnswer.pages?.length) ? (
                <Grid container spacing={1} data-generated-content="true" lang="en" dir="ltr">
                  {(answerOutput?.citations.length
                    ? answerOutput.citations
                    : lastAnswer.pages.map((page) => ({
                        documentId: null,
                        bookTitle: null,
                        pages: [{ page }],
                        excerpt: null,
                      }))).map((citation, index) => (
                    <Grid key={`${citation.documentId ?? "unknown"}-${index}`}>
                      <CitationBubble
                        citation={citation}
                        expanded={selectedCitation === citation}
                        onOpen={setSelectedCitation}
                      />
                    </Grid>
                  ))}
                </Grid>
              ) : null}
              <OutputFeedback
                target={answerOutput?.feedbackTarget}
              />
            </Stack>
          </CardContent>
        </Card>
      ) : null}

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

      {/* The Lecturer's voice. autoPlay so the lecture starts by itself. */}
      <audio
        ref={audioRef}
        autoPlay
        onPlaying={() => {
          if (firstAudioReported.current) return;
          firstAudioReported.current = true;
          startupComplete.current = true;
          if (startupTimer.current) clearTimeout(startupTimer.current);
          const clientElapsedMs = Math.round(performance.now() - startupStartedAt.current);
          reply({ type: "startup_audio_playing", client_elapsed_ms: clientElapsedMs }).catch(() => undefined);
        }}
      />
    </Stack>
  );
}
