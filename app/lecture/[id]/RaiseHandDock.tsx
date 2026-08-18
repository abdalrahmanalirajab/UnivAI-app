"use client";

import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import Fade from "@mui/material/Fade";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Popper from "@mui/material/Popper";
import Stack from "@mui/material/Stack";
import Snackbar from "@mui/material/Snackbar";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CheckRounded from "@mui/icons-material/CheckRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import ForumRounded from "@mui/icons-material/ForumRounded";
import MicOffRounded from "@mui/icons-material/MicOffRounded";
import MicRounded from "@mui/icons-material/MicRounded";
import PanToolAltRounded from "@mui/icons-material/PanToolAltRounded";
import ReplayRounded from "@mui/icons-material/ReplayRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import type { LocalAudioTrack } from "livekit-client";

import CitationBubble from "@/app/components/CitationBubble";
import OutputFeedback from "@/app/components/OutputFeedback";
import SourcePanel from "@/app/components/SourcePanel";
import type { OutputVersion } from "@/lib/feedback";
import type { LiveAnswerTurn } from "@/lib/live-conversation";
import { LIVE_SPEECH_STATES, LIVE_STATES } from "@/lib/standalone-contracts";
import type { CitationV1 } from "@/test/fixtures/citation-v1";
import { CREDIT_COSTS } from "@/lib/credit-costs";

type AgentState = (typeof LIVE_STATES)[number];
type SpeechState = (typeof LIVE_SPEECH_STATES)[number];
type HandState = "idle" | "raised" | "acked";

export type RaiseHandControlPhase =
  | "idle"
  | "waiting"
  | "ready"
  | "recording"
  | "processing"
  | "review"
  | "answering";

export function getRaiseHandControlPhase(input: {
  agentState: AgentState;
  hand: HandState;
  muted: boolean;
  transcript: string | null;
  finishing?: boolean;
}): RaiseHandControlPhase {
  if (input.transcript !== null || input.agentState === "review") return "review";
  if (input.agentState === "answering") return "answering";
  if (input.finishing || input.agentState === "processing") return "processing";
  if (
    !input.muted &&
    (input.hand === "acked" || input.agentState === "listening")
  ) {
    return "recording";
  }
  if (input.hand === "acked") return "ready";
  if (input.hand === "raised" || input.agentState === "asking") return "waiting";
  return "idle";
}

type Props = {
  connected: boolean;
  micBlocked: boolean;
  mic: LocalAudioTrack | null;
  muted: boolean;
  hand: HandState;
  agentState: AgentState;
  speechState: SpeechState | null;
  speechDetail: string | null;
  problem: string | null;
  progressDetail: string | null;
  transcript: string | null;
  answers: LiveAnswerTurn[];
  answerOutput: OutputVersion | null;
  metadataMessage: string | null;
  onRaiseHand: () => Promise<void> | void;
  onToggleMute: () => Promise<void> | void;
  onRetry: () => Promise<void> | void;
  onCancel: () => Promise<void> | void;
  onSend: (question: string) => Promise<void> | void;
  onDismissProblem?: () => void;
  onAnswerRegenerated?: (turn: LiveAnswerTurn, output: OutputVersion) => void;
};

const WAVE_SHAPE = [0.42, 0.72, 0.55, 1, 0.64, 0.82, 0.48, 0.94, 0.58, 0.76, 1, 0.52, 0.88, 0.62, 0.78, 0.46];

function useMicrophoneLevel(track: LocalAudioTrack | null, active: boolean) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    const mediaTrack = track?.mediaStreamTrack;
    if (!active || !mediaTrack || typeof AudioContext === "undefined") {
      setLevel(0);
      return;
    }

    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    const source = context.createMediaStreamSource(new MediaStream([mediaTrack]));
    source.connect(analyser);
    context.resume().catch(() => undefined);

    const samples = new Float32Array(analyser.fftSize);
    let frame = 0;
    let lastUpdate = 0;
    const tick = (now: number) => {
      if (now - lastUpdate >= 70) {
        lastUpdate = now;
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 55));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      context.close().catch(() => undefined);
    };
  }, [active, track]);

  return level;
}

function LiveWaveform({ level }: { level: number }) {
  return (
    <svg
      className="raise-hand-waveform"
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {WAVE_SHAPE.map((weight, index) => {
        const height = Math.max(4, Math.round(4 + weight * Math.max(0.14, level) * 25));
        return (
          <rect
            key={index}
            x={2 + index * 6}
            y={(32 - height) / 2}
            width="3"
            height={height}
            rx="1.5"
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}

export default function RaiseHandDock({
  connected,
  micBlocked,
  mic,
  muted,
  hand,
  agentState,
  speechState,
  speechDetail,
  problem,
  progressDetail,
  transcript,
  answers,
  answerOutput,
  metadataMessage,
  onRaiseHand,
  onToggleMute,
  onRetry,
  onCancel,
  onSend,
  onDismissProblem,
  onAnswerRegenerated,
}: Props) {
  const announcedAnswerId = useRef<string | null>(null);
  const [anchorElement, setAnchorElement] = useState<HTMLDivElement | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<"send" | "retry" | "cancel" | null>(null);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<CitationV1 | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dismissedProblem, setDismissedProblem] = useState<string | null>(null);
  const latestAnswer = answers[answers.length - 1] ?? null;
  const phase = getRaiseHandControlPhase({
    agentState,
    hand,
    muted,
    transcript,
    finishing,
  });
  const level = useMicrophoneLevel(mic, phase === "recording");
  const visibleProblem = problem && problem !== dismissedProblem ? problem : null;

  useEffect(() => {
    setText(transcript ?? "");
    setPending(null);
  }, [transcript]);

  useEffect(() => {
    if (agentState !== "listening" || transcript !== null) setFinishing(false);
  }, [agentState, transcript]);

  useEffect(() => {
    if (!problem) setDismissedProblem(null);
  }, [problem]);

  useEffect(() => {
    if (latestAnswer && announcedAnswerId.current !== latestAnswer.id) {
      announcedAnswerId.current = latestAnswer.id;
      setAnswerOpen(true);
    }
  }, [latestAnswer]);

  useEffect(() => {
    if (hand !== "idle" && agentState !== "answering") setAnswerOpen(false);
  }, [agentState, hand]);

  const unavailable = !connected || micBlocked || agentState === "ended";
  const idleTooltip = !connected
    ? "Reconnect before raising your hand"
    : micBlocked
      ? "Microphone access is required to raise your hand"
      : agentState === "ended"
        ? "This lecture has ended"
        : "Raise your hand";
  const reviewProblem = speechState === "no_speech" || speechState === "error";
  const reviewTitle = reviewProblem
    ? "Type or correct your question"
    : "Check what I heard";

  async function beginQuestion() {
    setAnswerOpen(false);
    setActionError(null);
    try {
      await onRaiseHand();
    } catch (error) {
      setActionError(
        error instanceof Error && error.message.includes("reconnecting")
          ? error.message
          : "The lecturer is reconnecting. Try again shortly.",
      );
    }
  }

  function dismissNotice() {
    setActionError(null);
    if (problem) setDismissedProblem(problem);
    onDismissProblem?.();
  }

  async function finishRecording() {
    if (finishing) return;
    setFinishing(true);
    try {
      await onToggleMute();
    } catch (error) {
      setFinishing(false);
      throw error;
    }
  }

  async function submitQuestion() {
    const question = text.trim();
    if (!question || pending) return;
    setPending("send");
    try {
      await onSend(question);
    } catch (error) {
      setPending(null);
      setActionError(
        error instanceof Error && /Credits|reconnecting/i.test(error.message)
          ? error.message
          : "Your question could not be sent. Try again shortly.",
      );
      throw error;
    }
  }

  async function retryQuestion() {
    if (pending) return;
    setPending("retry");
    try {
      await onRetry();
    } catch {
      setPending(null);
      setActionError("The microphone could not restart. Type your question instead.");
      throw new Error("The microphone could not restart.");
    }
  }

  async function cancelQuestion() {
    if (pending) return;
    setPending("cancel");
    try {
      await onCancel();
      setPending(null);
    } catch {
      setPending(null);
      setActionError("The request could not be completed. Try again shortly.");
      throw new Error("The request could not be completed.");
    }
  }

  return (
    <>
      <div className="raise-hand-dock">
        <Paper
          ref={setAnchorElement}
          elevation={10}
          className={`raise-hand-control raise-hand-control-${phase}`}
          aria-live="polite"
          aria-busy={phase === "processing" || phase === "answering" || pending !== null}
        >
          {phase === "idle" ? (
            <Fade in timeout={180}>
              <span className="raise-hand-round-content">
                <Tooltip title={idleTooltip} placement="left">
                  <span>
                    <IconButton
                      className="raise-hand-round-button"
                      color="inherit"
                      disabled={unavailable}
                      aria-label={idleTooltip}
                      onClick={() => void beginQuestion()}
                    >
                      <PanToolAltRounded />
                    </IconButton>
                  </span>
                </Tooltip>
              </span>
            </Fade>
          ) : null}

          {phase === "waiting" ? (
            <Fade in timeout={180}>
              <Stack direction="row" spacing={1} className="raise-hand-busy-content align-center">
                <CircularProgress size={20} color="inherit" />
                <Typography variant="body2">
                  Hand raised — finishing the current sentence
                </Typography>
                <Tooltip title="Lower hand" placement="top">
                  <IconButton
                    color="inherit"
                    size="small"
                    aria-label="Lower hand"
                    disabled={pending !== null}
                    onClick={() => void cancelQuestion().catch(() => undefined)}
                  >
                    <CloseRounded />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Fade>
          ) : null}

          {phase === "ready" ? (
            <Fade in timeout={180}>
              <span className="raise-hand-round-content">
                <Tooltip title="The lecturer is ready. Open your microphone" placement="left">
                  <IconButton
                    className="raise-hand-round-button"
                    color="inherit"
                    aria-label="Open microphone"
                    onClick={() => void Promise.resolve(onToggleMute()).catch(() => undefined)}
                  >
                    <MicOffRounded />
                  </IconButton>
                </Tooltip>
              </span>
            </Fade>
          ) : null}

          {phase === "recording" ? (
            <Fade in timeout={180}>
              <Stack direction="row" spacing={1} className="raise-hand-recording-content align-center">
                <Tooltip title="Finish recording">
                  <IconButton
                    color="inherit"
                    aria-label="Finish recording"
                    onClick={() => void finishRecording().catch(() => undefined)}
                  >
                    <MicRounded />
                  </IconButton>
                </Tooltip>
                <LiveWaveform level={level} />
                <Typography variant="caption" className="raise-hand-recording-label">
                  Recording
                </Typography>
                <Tooltip title="Done speaking">
                  <IconButton
                    color="inherit"
                    aria-label="Done speaking"
                    onClick={() => void finishRecording().catch(() => undefined)}
                  >
                    <CheckRounded />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Fade>
          ) : null}

          {phase === "processing" || phase === "answering" ? (
            <Fade in timeout={180}>
              <Stack direction="row" spacing={1.5} className="raise-hand-busy-content align-center">
                <CircularProgress size={22} color="inherit" />
                <Typography variant="body2">
                  {phase === "processing"
                    ? "Turning speech into text…"
                    : progressDetail || "Preparing your answer…"}
                </Typography>
              </Stack>
            </Fade>
          ) : null}

          {phase === "review" ? (
            <Fade in timeout={220}>
              <Stack spacing={1.5} className="raise-hand-review-content">
                <Stack direction="row" className="spread-row align-center">
                  <Stack spacing={0.25}>
                    <Typography variant="overline" color="text.secondary">
                      Your question
                    </Typography>
                    <Typography variant="subtitle1">{reviewTitle}</Typography>
                  </Stack>
                  <Tooltip title="Discard question">
                    <IconButton
                      size="small"
                      aria-label="Discard question"
                      disabled={pending !== null}
                      onClick={() => void cancelQuestion().catch(() => undefined)}
                    >
                      <CloseRounded />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  maxRows={4}
                  autoFocus
                  label="Question transcript"
                  value={text}
                  disabled={pending !== null}
                  error={reviewProblem && !text}
                  helperText={
                    speechDetail ||
                    (text
                      ? "Edit anything that was misheard, then send."
                      : "Type your question, or try the microphone again.")
                  }
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submitQuestion().catch(() => undefined);
                    }
                  }}
                />
                {visibleProblem && !speechDetail ? (
                  <Alert severity="warning" onClose={dismissNotice}>{visibleProblem}</Alert>
                ) : null}
                <Stack direction="row" spacing={1} className="spread-row align-center">
                  <Tooltip title="Try microphone again">
                    <span>
                      <IconButton
                        aria-label="Try microphone again"
                        disabled={pending !== null}
                        onClick={() => void retryQuestion().catch(() => undefined)}
                      >
                        <ReplayRounded />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Button
                    variant="contained"
                    endIcon={<SendRounded />}
                    disabled={!text.trim() || pending !== null}
                    onClick={() => void submitQuestion().catch(() => undefined)}
                  >
                    {pending === "send"
                      ? "Sending…"
                      : `Ask · ${CREDIT_COSTS.raise_hand} Credits`}
                  </Button>
                </Stack>
              </Stack>
            </Fade>
          ) : null}
        </Paper>
      </div>

      <Snackbar
        open={phase !== "review" && Boolean(actionError || visibleProblem)}
        autoHideDuration={6_000}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        onClose={dismissNotice}
      >
        <Alert severity="warning" variant="filled" onClose={dismissNotice}>
          {actionError || visibleProblem}
        </Alert>
      </Snackbar>

      <Popper
        open={answerOpen && latestAnswer !== null}
        anchorEl={anchorElement}
        placement="top-end"
        transition
        className="raise-hand-answer-popper"
        modifiers={[{ name: "offset", options: { offset: [0, 14] } }]}
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={220}>
            <Paper elevation={12} className="raise-hand-answer-card" role="status">
              {latestAnswer ? (
                <Stack spacing={1.5}>
                  <Stack direction="row" className="spread-row align-center">
                    <Typography variant="overline" color="secondary">
                      Lecturer answered
                    </Typography>
                    <IconButton
                      size="small"
                      aria-label="Dismiss answer"
                      onClick={() => setAnswerOpen(false)}
                    >
                      <CloseRounded />
                    </IconButton>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {latestAnswer.question}
                  </Typography>
                  <Typography data-generated-content="true" dir="auto">
                    {latestAnswer.answer}
                  </Typography>
                  {latestAnswer.pages.length ? (
                    <Stack direction="row" spacing={1} className="wrap-row">
                      {latestAnswer.pages.map((page) => (
                        <Chip key={page} size="small" variant="outlined" label={`p. ${page}`} />
                      ))}
                    </Stack>
                  ) : null}
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<ForumRounded />}
                    onClick={() => {
                      setAnswerOpen(false);
                      setHistoryOpen(true);
                    }}
                  >
                    Conversation ({answers.length})
                  </Button>
                </Stack>
              ) : null}
            </Paper>
          </Fade>
        )}
      </Popper>

      <Drawer
        anchor="right"
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        slotProps={{
          paper: {
            className: "raise-hand-conversation-drawer",
            "aria-label": "Raise-hand conversation",
          },
        }}
      >
        <Stack spacing={2} className="raise-hand-conversation-content">
          <Stack direction="row" className="spread-row align-center">
            <Stack spacing={0.25}>
              <Typography variant="overline" color="text.secondary">
                Lecture Q&amp;A
              </Typography>
              <Typography variant="h6">Raise-hand conversation</Typography>
            </Stack>
            <IconButton aria-label="Close conversation" onClick={() => setHistoryOpen(false)}>
              <CloseRounded />
            </IconButton>
          </Stack>
          <Divider />
          <Stack spacing={2} className="raise-hand-history-list">
            {answers.map((turn, index) => {
              const isLatest = index === answers.length - 1;
              const resolvedCitations = isLatest ? answerOutput?.citations ?? [] : [];
              return (
                <Paper key={turn.id} variant="outlined" className="raise-hand-history-turn">
                  <Stack spacing={1}>
                    <Typography variant="overline" color="text.secondary">
                      {turn.slide ? `You · slide ${turn.slide}` : "You"}
                    </Typography>
                    <Typography>{turn.question}</Typography>
                    <Typography variant="overline" color="secondary">
                      Lecturer
                    </Typography>
                    <Typography data-generated-content="true" dir="auto">
                      {turn.answer}
                    </Typography>
                    {resolvedCitations.length ? (
                      <Stack direction="row" spacing={1} className="wrap-row">
                        {resolvedCitations.map((citation, citationIndex) => (
                          <CitationBubble
                            key={`${turn.id}-${citation.documentId}-${citationIndex}`}
                            citation={citation}
                            onOpen={(selected) => {
                              setHistoryOpen(false);
                              setSelectedCitation(selected);
                            }}
                          />
                        ))}
                      </Stack>
                    ) : turn.pages.length ? (
                      <Stack direction="row" spacing={1} className="wrap-row">
                        {turn.pages.map((page) => (
                          <Chip key={page} size="small" variant="outlined" label={`p. ${page}`} />
                        ))}
                      </Stack>
                    ) : null}
                    {isLatest && metadataMessage ? (
                      <Typography variant="caption" color="text.secondary">
                        {metadataMessage}
                      </Typography>
                    ) : null}
                    {isLatest && answerOutput?.feedbackTarget ? (
                      <OutputFeedback
                        target={answerOutput.feedbackTarget}
                        onRegenerated={onAnswerRegenerated}
                      />
                    ) : null}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </Stack>
      </Drawer>

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
    </>
  );
}
