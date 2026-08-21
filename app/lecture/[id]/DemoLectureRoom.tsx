"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import LectureSlides from "./LectureSlides";
import RaiseHandDock from "./RaiseHandDock";
import {
  assertVttMatchesManifest,
  parseDemoVtt,
  validateDemoLectureManifest,
  type DemoLectureManifest,
} from "@/lib/demo-media-contract";
import type { AiOutputTarget } from "@/lib/ai-output-feedback-types";
import type { OutputVersion } from "@/lib/feedback";
import { loadLiveAnswerMetadata } from "@/lib/live-answer-metadata";
import { appendLiveAnswerTurn, type LiveAnswerTurn } from "@/lib/live-conversation";
import { LIVE_SPEECH_STATES, LIVE_STATES } from "@/lib/standalone-contracts";

type Checkpoint = {
  admitted: boolean;
  completed: boolean;
  currentCue: number;
  furthestCompletedCue: number;
  totalCues: number;
  checkpointVersion: number;
  replayFrom: number;
  isResume: boolean;
};

type Descriptor = {
  lecture: { id: string; week: number; title: string };
  locale: "en" | "ar";
  scriptDigest: string;
  manifestUrl: string;
  captionsUrl: string;
  audioUrl: string;
  welcomeBackUrl: string;
  firstJoinUrl: string;
  askPromptUrl: string;
  answerResumeUrl: string;
  checkpoint: Checkpoint;
  history: Array<{ turn: AnswerTurn; feedbackTarget: AiOutputTarget; feedbackSubmitted: boolean }>;
  previousLecture: { id: string; week: number; title: string } | null;
};

type AnswerTurn = LiveAnswerTurn;

type QuestionResponse = {
  kind?: "answer" | "command";
  turn?: AnswerTurn;
  citations?: Array<Record<string, unknown>>;
  feedbackTarget?: AiOutputTarget;
  answerAudioUrl?: string | null;
  command?: {
    kind: "seek" | "resume" | "clarify_previous" | "confirm_previous_week" | "message";
    cueIndex?: number;
    message?: string;
    previousSlideCue?: number | null;
    previousWeekAvailable?: boolean;
  };
  error?: string;
};

type TurnState = "idle" | "waiting" | "ready" | "listening" | "review" | "processing" | "answering";
type AgentState = (typeof LIVE_STATES)[number];
type SpeechState = (typeof LIVE_SPEECH_STATES)[number];

type RecognitionResultEvent = Event & { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> };
type RecognitionErrorEvent = Event & { error?: string };
type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => RecognitionLike;

const FETCH_TIMEOUT_MS = 15_000;
const QUESTION_TIMEOUT_MS = 75_000;
const LEASE_MS = 15_000;
const MIN_JOIN_SECONDS = 5;
const MAX_JOIN_SECONDS = 20;

const STATE_LABEL: Record<AgentState, string> = {
  connecting: "Connecting…",
  preparing: "Loading the lecturer's voice…",
  waiting: "Waiting for you to reconnect",
  resuming: "Welcoming you back…",
  lecturing: "Lecturer speaking",
  asking: "Lecturer is asking you…",
  listening: "Listening to you…",
  processing: "Turning speech into text…",
  review: "Check your question",
  answering: "Answering your question",
  ended: "Lecture finished",
};

function randomJoinSeconds(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return MIN_JOIN_SECONDS + (value[0] % (MAX_JOIN_SECONDS - MIN_JOIN_SECONDS + 1));
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeout = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(input, { ...init, signal: init.signal ?? controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function cueAt(manifest: DemoLectureManifest, timeMs: number): number {
  let low = 0;
  let high = manifest.cues.length - 1;
  let found = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (manifest.cues[middle].startMs <= timeMs) {
      found = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return found;
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof DOMException && error.name === "AbortError") return `${fallback} The request timed out.`;
  return error instanceof Error ? error.message : fallback;
}

export default function DemoLectureRoom({ lectureId }: { lectureId: string }) {
  const [descriptor, setDescriptor] = useState<Descriptor | null>(null);
  const [manifest, setManifest] = useState<DemoLectureManifest | null>(null);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [narrationStarted, setNarrationStarted] = useState(false);
  const [lectureCompleted, setLectureCompleted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [joinRemaining, setJoinRemaining] = useState<number | null>(null);
  const [activeCue, setActiveCue] = useState(0);
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [turnState, setTurnState] = useState<TurnState>("idle");
  const [question, setQuestion] = useState("");
  const [speechProblem, setSpeechProblem] = useState<string | null>(null);
  const [speechState, setSpeechState] = useState<SpeechState | null>(null);
  const [speechDetail, setSpeechDetail] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [micTrack, setMicTrack] = useState<MediaStreamTrack | null>(null);
  const [answers, setAnswers] = useState<AnswerTurn[]>([]);
  const [answerOutput, setAnswerOutput] = useState<Pick<OutputVersion, "citations" | "feedbackTarget"> | null>(null);
  const [currentAnswerId, setCurrentAnswerId] = useState<string | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<Record<string, { target: AiOutputTarget; submitted: boolean }>>({});
  const [metadataMessage, setMetadataMessage] = useState<string | null>(null);
  const [ambiguity, setAmbiguity] = useState<QuestionResponse["command"] | null>(null);
  const [confirmPreviousWeek, setConfirmPreviousWeek] = useState(false);
  const [turnMessage, setTurnMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const manifestRef = useRef<DemoLectureManifest | null>(null);
  const descriptorRef = useRef<Descriptor | null>(null);
  const checkpointRef = useRef<Checkpoint | null>(null);
  const activeCueRef = useRef(0);
  const furthestQueuedRef = useRef(0);
  const coverageStartSeenRef = useRef(false);
  const mutationQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const playedSecondsRef = useRef(0);
  const lastFrameAtRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const stallTimerRef = useRef(0);
  const pendingHandCueRef = useRef<number | null>(null);
  const handCheckpointRef = useRef<{ cue: number; eventId: string; promise: Promise<Checkpoint> | null } | null>(null);
  const handOpenRef = useRef(false);
  const handAttemptRef = useRef(0);
  const turnContextCueRef = useRef(0);
  const resumeCueRef = useRef(0);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const recognitionAttemptRef = useRef(0);
  const questionControllerRef = useRef<AbortController | null>(null);
  const questionRequestRef = useRef<{ key: string; id: string } | null>(null);
  const serverActiveRef = useRef(false);
  const startInFlightRef = useRef(false);
  const autoStartRequestedRef = useRef(false);
  const sessionIdRef = useRef(crypto.randomUUID());
  const leaveEventIdRef = useRef(crypto.randomUUID());
  const tabIdRef = useRef(crypto.randomUUID());
  const channelRef = useRef<BroadcastChannel | null>(null);
  const ownsLeaseRef = useRef(false);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const interactionAudioRef = useRef<HTMLAudioElement | null>(null);
  const interactionAttemptRef = useRef(0);
  const interactionCancelRef = useRef<(() => void) | null>(null);
  const turnSequenceRef = useRef(0);
  const presentationReadyRef = useRef(false);
  const presentationReadyWaitersRef = useRef(new Set<() => void>());
  const lastAnswer = answers[answers.length - 1] ?? null;

  const stopInteractionAudio = useCallback(() => {
    interactionAttemptRef.current += 1;
    interactionCancelRef.current?.();
    interactionCancelRef.current = null;
    interactionAudioRef.current?.pause();
    interactionAudioRef.current = null;
  }, []);

  const playInteractionClip = useCallback(async (url: string, timeoutMs = 45_000) => {
    stopInteractionAudio();
    const attempt = interactionAttemptRef.current;
    const audio = new Audio(url);
    interactionAudioRef.current = audio;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (error) audio.pause();
        if (interactionAudioRef.current === audio) interactionAudioRef.current = null;
        interactionCancelRef.current = null;
        if (error) reject(error);
        else resolve();
      };
      const timer = window.setTimeout(() => finish(new Error("The lecturer's voice took too long.")), timeoutMs);
      interactionCancelRef.current = () => finish(new DOMException("Cancelled", "AbortError"));
      audio.onended = () => finish();
      audio.onerror = () => finish(new Error("The lecturer's voice could not be played."));
      void audio.play().catch((error) => finish(error instanceof Error ? error : new Error("The lecturer's voice could not start.")));
    });
    if (attempt !== interactionAttemptRef.current) throw new DOMException("Cancelled", "AbortError");
  }, [stopInteractionAudio]);

  useEffect(() => {
    autoStartRequestedRef.current = false;
    presentationReadyRef.current = false;
    presentationReadyWaitersRef.current.clear();
    setNarrationStarted(false);
    const endsAt = Date.now() + randomJoinSeconds() * 1_000;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1_000));
      setJoinRemaining(remaining);
      if (remaining === 0) window.clearInterval(timer);
    };
    const timer = window.setInterval(tick, 250);
    tick();
    return () => window.clearInterval(timer);
  }, [lectureId]);

  const updateCheckpoint = useCallback((next: Checkpoint) => {
    checkpointRef.current = next;
    if (next.completed) setLectureCompleted(true);
    furthestQueuedRef.current = Math.max(furthestQueuedRef.current, next.furthestCompletedCue);
    setCheckpoint(next);
    const digest = descriptorRef.current?.scriptDigest;
    if (digest) {
      try {
        localStorage.setItem(`univai:demo-lecture:${lectureId}`, JSON.stringify({
          scriptDigest: digest,
          currentCue: next.currentCue,
          furthestCompletedCue: next.furthestCompletedCue,
          checkpointVersion: next.checkpointVersion,
        }));
      } catch { /* the server checkpoint remains canonical */ }
    }
  }, [lectureId]);

  const sendAction = useCallback(async (
    type: "start" | "checkpoint" | "heartbeat" | "pause" | "leave" | "complete",
    values: Partial<{ currentCue: number; furthestCompletedCue: number; attendedSeconds: number; eventId: string }> = {},
  ): Promise<Checkpoint> => {
    const currentDescriptor = descriptorRef.current;
    const currentCheckpoint = checkpointRef.current;
    if (!currentDescriptor || !currentCheckpoint) throw new Error("The lecture is not ready yet.");
    const response = await fetchWithTimeout(`/api/lecture/${lectureId}/demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: type === "leave",
      body: JSON.stringify({
        type,
        eventId: values.eventId ?? crypto.randomUUID(),
        sessionId: sessionIdRef.current,
        scriptDigest: currentDescriptor.scriptDigest,
        // The current cue may equal the number of completed cues, but it must
        // never jump beyond saved coverage. That old mismatch made Q&A reject
        // an otherwise valid raise-hand turn as future material.
        currentCue: values.currentCue ?? Math.min(activeCueRef.current, furthestQueuedRef.current),
        furthestCompletedCue: values.furthestCompletedCue ?? furthestQueuedRef.current,
        checkpointVersion: currentCheckpoint.checkpointVersion,
        attendedSeconds: values.attendedSeconds ?? 0,
      }),
    });
    const body = await response.json().catch(() => ({})) as { checkpoint?: Checkpoint; error?: string; code?: string };
    if (!response.ok || !body.checkpoint) throw new Error(body.error ?? "Lecture progress could not be saved.");
    updateCheckpoint(body.checkpoint);
    return body.checkpoint;
  }, [lectureId, updateCheckpoint]);

  const enqueueAction = useCallback((task: () => Promise<unknown>) => {
    const queued = mutationQueueRef.current.then(task, task);
    mutationQueueRef.current = queued.catch((error) => {
      setWarning(errorText(error, "Playback progress is temporarily stored only in this browser."));
    });
    return queued;
  }, []);

  const flushAttended = useCallback((type: "heartbeat" | "pause" | "leave" | "complete") => {
    const seconds = Math.min(15, Math.max(0, playedSecondsRef.current));
    playedSecondsRef.current = Math.max(0, playedSecondsRef.current - seconds);
    return enqueueAction(async () => {
      try {
        await sendAction(type, { attendedSeconds: seconds, eventId: type === "leave" ? leaveEventIdRef.current : undefined });
      } catch (error) {
        playedSecondsRef.current += seconds;
        throw error;
      }
    });
  }, [enqueueAction, sendAction]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setProblem(null);
      setReady(false);
      try {
        const descriptorResponse = await fetchWithTimeout(`/api/lecture/${lectureId}/demo`, { cache: "no-store" });
        const descriptorBody = await descriptorResponse.json().catch(() => ({})) as Descriptor & { error?: string };
        if (!descriptorResponse.ok) throw new Error(descriptorBody.error ?? "The lecture could not be opened.");
        const [manifestResponse, captionsResponse] = await Promise.all([
          fetchWithTimeout(descriptorBody.manifestUrl, { cache: "no-store" }),
          fetchWithTimeout(descriptorBody.captionsUrl, { cache: "no-store" }),
        ]);
        if (!manifestResponse.ok || !captionsResponse.ok) throw new Error("The lecture room could not finish loading.");
        const parsedManifest = validateDemoLectureManifest(await manifestResponse.json());
        if (parsedManifest.lecturePublicId !== lectureId || parsedManifest.scriptDigest !== descriptorBody.scriptDigest) throw new Error("This lecture was updated. Refresh to join the latest version.");
        assertVttMatchesManifest(parseDemoVtt(await captionsResponse.text()), parsedManifest);
        if (!active) return;
        descriptorRef.current = descriptorBody;
        manifestRef.current = parsedManifest;
        checkpointRef.current = descriptorBody.checkpoint;
        furthestQueuedRef.current = descriptorBody.checkpoint.furthestCompletedCue;
        const initialCue = Math.min(parsedManifest.cues.length - 1, descriptorBody.checkpoint.currentCue);
        activeCueRef.current = initialCue;
        setActiveCue(initialCue);
        setDescriptor(descriptorBody);
        setManifest(parsedManifest);
        setCheckpoint(descriptorBody.checkpoint);
        setLectureCompleted(descriptorBody.checkpoint.completed);
        setAnswers(descriptorBody.history.map((entry) => entry.turn));
        setAnswerFeedback(Object.fromEntries(descriptorBody.history.map((entry) => [entry.turn.id, {
          target: entry.feedbackTarget,
          submitted: entry.feedbackSubmitted,
        }])));
        setCurrentAnswerId(null);
        setAnswerOutput(null);
      } catch (error) {
        if (active) setProblem(errorText(error, "The lecture room could not be opened."));
      }
    };
    void load();
    return () => { active = false; };
  }, [lectureId]);

  useEffect(() => {
    if (!lastAnswer || lastAnswer.id !== currentAnswerId) {
      setAnswerOutput(null);
      setMetadataMessage(null);
      return;
    }
    let active = true;
    void loadLiveAnswerMetadata(lectureId).then((result) => {
      if (!active) return;
      setAnswerOutput(result.output);
      setMetadataMessage(result.message);
    });
    return () => { active = false; };
  }, [currentAnswerId, lastAnswer, lectureId]);

  const setCuePosition = useCallback((cueIndex: number) => {
    const audio = audioRef.current;
    const currentManifest = manifestRef.current;
    if (!audio || !currentManifest) return;
    const bounded = Math.min(currentManifest.cues.length - 1, Math.max(0, cueIndex));
    audio.currentTime = currentManifest.cues[bounded].startMs / 1_000;
    activeCueRef.current = bounded;
    coverageStartSeenRef.current = bounded === furthestQueuedRef.current;
    setActiveCue(bounded);
  }, []);

  const releaseLease = useCallback(() => {
    ownsLeaseRef.current = false;
    const key = `univai:demo-owner:${lectureId}`;
    try {
      const current = JSON.parse(localStorage.getItem(key) ?? "null") as { tabId?: string } | null;
      if (current?.tabId === tabIdRef.current) localStorage.removeItem(key);
    } catch { /* a corrupt local mirror grants no access */ }
  }, [lectureId]);

  const claimLease = useCallback(() => {
    const key = `univai:demo-owner:${lectureId}`;
    try {
      ownsLeaseRef.current = true;
      localStorage.setItem(key, JSON.stringify({ tabId: tabIdRef.current, expiresAt: Date.now() + LEASE_MS }));
      channelRef.current?.postMessage({ type: "claim", tabId: tabIdRef.current });
    } catch { /* BroadcastChannel still transfers playback ownership */ }
  }, [lectureId]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`univai-demo-lecture-${lectureId}`);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<{ type?: string; tabId?: string }>) => {
      if (event.data?.type === "claim" && event.data.tabId !== tabIdRef.current) {
        handAttemptRef.current += 1;
        handOpenRef.current = false;
        pendingHandCueRef.current = null;
        handCheckpointRef.current = null;
        ownsLeaseRef.current = false;
        audioRef.current?.pause();
        recognitionAttemptRef.current += 1;
        try { recognitionRef.current?.abort(); } catch { /* already stopped */ }
        recognitionRef.current = null;
        questionControllerRef.current?.abort();
        questionControllerRef.current = null;
        microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
        microphoneStreamRef.current = null;
        setMicTrack(null);
        setMuted(true);
        turnSequenceRef.current += 1;
        stopInteractionAudio();
        serverActiveRef.current = false;
        setStarted(false);
        setNarrationStarted(false);
        window.location.assign("/start");
      }
    };
    return () => { channel.close(); channelRef.current = null; };
  }, [lectureId, stopInteractionAudio]);

  const markPresentationReady = useCallback(() => {
    presentationReadyRef.current = true;
    for (const resolve of presentationReadyWaitersRef.current) resolve();
    presentationReadyWaitersRef.current.clear();
  }, []);

  const waitForPresentation = useCallback(async () => {
    if (presentationReadyRef.current) return;
    await new Promise<void>((resolve, reject) => {
      const ready = () => {
        window.clearTimeout(timer);
        resolve();
      };
      const timer = window.setTimeout(() => {
        presentationReadyWaitersRef.current.delete(ready);
        reject(new Error("The presentation did not become ready in time."));
      }, 20_000);
      presentationReadyWaitersRef.current.add(ready);
    });
  }, []);

  const startPlayback = useCallback(async () => {
    if (
      starting ||
      startInFlightRef.current ||
      joinRemaining !== 0 ||
      !descriptorRef.current ||
      !manifestRef.current ||
      !audioRef.current
    ) return;
    startInFlightRef.current = true;
    setStarting(true);
    setProblem(null);
    let serverStarted = false;
    try {
      claimLease();
      const beforeStart = checkpointRef.current;
      const wasAdmitted = Boolean(beforeStart?.admitted && !beforeStart.completed);
      const next = await sendAction("start", {
        currentCue: beforeStart?.currentCue ?? 0,
        furthestCompletedCue: beforeStart?.furthestCompletedCue ?? 0,
      });
      serverStarted = true;
      serverActiveRef.current = true;
      setCuePosition(wasAdmitted ? next.replayFrom : 0);
      setStarted(true);
      await waitForPresentation();
      const welcome = new Audio(wasAdmitted ? descriptorRef.current.welcomeBackUrl : descriptorRef.current.firstJoinUrl);
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("The lecturer's welcome took too long.")), 20_000);
        welcome.onended = () => { window.clearTimeout(timer); resolve(); };
        welcome.onerror = () => { window.clearTimeout(timer); reject(new Error("The lecturer's welcome could not be heard.")); };
        welcome.play().catch(reject);
      });
      await audioRef.current.play();
      setNarrationStarted(true);
    } catch (error) {
      if (serverStarted) await sendAction("leave", { attendedSeconds: 0, eventId: crypto.randomUUID() }).catch(() => undefined);
      serverActiveRef.current = false;
      releaseLease();
      setStarted(false);
      setNarrationStarted(false);
      setProblem(errorText(error, "The lecture could not start."));
    } finally {
      startInFlightRef.current = false;
      setStarting(false);
    }
  }, [claimLease, joinRemaining, releaseLease, sendAction, setCuePosition, starting, waitForPresentation]);

  useEffect(() => {
    if (
      autoStartRequestedRef.current ||
      joinRemaining !== 0 ||
      !ready ||
      !descriptor ||
      !manifest ||
      !checkpoint ||
      checkpoint.completed ||
      started ||
      starting
    ) return;
    autoStartRequestedRef.current = true;
    void startPlayback();
  }, [checkpoint, descriptor, joinRemaining, manifest, ready, startPlayback, started, starting]);

  const markCoverage = useCallback((currentTimeMs: number) => {
    const currentManifest = manifestRef.current;
    if (!currentManifest) return;
    const nextIndex = furthestQueuedRef.current;
    if (nextIndex >= currentManifest.cues.length || !coverageStartSeenRef.current) return;
    const cue = currentManifest.cues[nextIndex];
    if (currentTimeMs + 2 < cue.endMs) return;
    const completedThrough = nextIndex + 1;
    const eventId = crypto.randomUUID();
    furthestQueuedRef.current = completedThrough;
    // Seeking resets this flag. Continuous playback can therefore catch up
    // after a slow animation frame without counting a replay as new coverage.
    coverageStartSeenRef.current = completedThrough < currentManifest.cues.length
      && currentTimeMs >= currentManifest.cues[completedThrough].startMs;
    enqueueAction(async () => {
      const values = {
        currentCue: Math.min(currentManifest.cues.length - 1, completedThrough),
        furthestCompletedCue: completedThrough,
        eventId,
      };
      try {
        return await sendAction("checkpoint", values);
      } catch {
        // A lost response may arrive after the server committed the event.
        // Retrying the exact event returns the same result without a double count.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 300));
        return sendAction("checkpoint", values);
      }
    }).catch(() => {
      const savedCue = checkpointRef.current?.furthestCompletedCue ?? nextIndex;
      furthestQueuedRef.current = savedCue;
      coverageStartSeenRef.current = false;
      audioRef.current?.pause();
      setCuePosition(savedCue);
      setWarning("The lecturer is reconnecting to your saved place…");
      window.setTimeout(() => {
        if (!navigator.onLine || handOpenRef.current) return;
        void audioRef.current?.play().then(() => setWarning(null)).catch(() => undefined);
      }, 1_000);
    });
  }, [enqueueAction, sendAction, setCuePosition]);

  const speakHandPrompt = useCallback(() => {
    const attempt = ++turnSequenceRef.current;
    const url = descriptorRef.current?.askPromptUrl;
    if (!url) {
      setSpeechProblem("The lecturer is ready. Open your microphone or type your question.");
      setTurnState("ready");
      return;
    }
    void playInteractionClip(url).then(() => {
      if (attempt === turnSequenceRef.current) setTurnState("ready");
    }).catch((error) => {
      if (attempt !== turnSequenceRef.current || (error instanceof DOMException && error.name === "AbortError")) return;
      setSpeechProblem("The lecturer is ready. Open your microphone or type your question.");
      setTurnState("ready");
    });
  }, [playInteractionClip]);

  const saveHandBoundary = useCallback(async (cue: number, announce = true) => {
    const currentManifest = manifestRef.current;
    if (!currentManifest) throw new Error("The lecture is not ready yet.");
    const attempt = handAttemptRef.current;
    let pending = handCheckpointRef.current;
    if (!pending || pending.cue !== cue) {
      pending = { cue, eventId: crypto.randomUUID(), promise: null };
      handCheckpointRef.current = pending;
    }
    setTurnMessage("Saving your place before the lecturer listens…");
    setTurnState("processing");
    try {
      // A heartbeat/checkpoint already in flight owns the current version.
      // Finish it first, then write this boundary with one stable event id so
      // a lost response can be retried without double-counting the sentence.
      await mutationQueueRef.current;
      let latest = checkpointRef.current;
      if (!latest) throw new Error("The lecture checkpoint is unavailable.");
      const completedThrough = cue + 1;
      if (latest.furthestCompletedCue < cue) {
        throw new Error("The lecture must replay the last saved sentence before taking a question.");
      }
      if (latest.furthestCompletedCue < completedThrough) {
        pending.promise ??= enqueueAction(() => sendAction("checkpoint", {
          currentCue: Math.min(currentManifest.cues.length - 1, completedThrough),
          furthestCompletedCue: completedThrough,
          eventId: pending!.eventId,
        })) as Promise<Checkpoint>;
        latest = await pending.promise;
      }
      if (attempt !== handAttemptRef.current || !handOpenRef.current) return latest;
      handCheckpointRef.current = null;
      resumeCueRef.current = completedThrough;
      setSpeechProblem(null);
      setSpeechState(null);
      setTurnMessage(null);
      void flushAttended("pause");
      if (announce) speakHandPrompt();
      return latest;
    } catch (error) {
      pending.promise = null;
      if (attempt === handAttemptRef.current && handOpenRef.current) {
        setSpeechProblem(
          `${errorText(error, "Your place could not be saved.")} The lecture is paused; retry or cancel safely.`,
        );
        setSpeechState("error");
        setTurnMessage(null);
        setTurnState("review");
      }
      throw error;
    }
  }, [enqueueAction, flushAttended, sendAction, speakHandPrompt]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !manifest) return;
    const sync = (timestamp = performance.now()) => {
      const timeMs = audio.currentTime * 1_000;
      const cueIndex = cueAt(manifest, timeMs);
      if (cueIndex !== activeCueRef.current) {
        activeCueRef.current = cueIndex;
        setActiveCue(cueIndex);
      }
      if (cueIndex === furthestQueuedRef.current && timeMs >= manifest.cues[cueIndex].startMs) coverageStartSeenRef.current = true;
      if (!audio.paused && !audio.seeking && navigator.onLine && (turnState === "idle" || turnState === "waiting")) {
        if (lastFrameAtRef.current !== null) playedSecondsRef.current += Math.min(0.25, Math.max(0, (timestamp - lastFrameAtRef.current) / 1_000));
        markCoverage(timeMs);
      }
      lastFrameAtRef.current = timestamp;
      const handCue = pendingHandCueRef.current;
      if (handCue !== null && timeMs + 8 >= manifest.cues[handCue].endMs) {
        pendingHandCueRef.current = null;
        audio.pause();
        audio.currentTime = manifest.cues[handCue].endMs / 1_000;
        void saveHandBoundary(handCue).catch(() => undefined);
      }
      frameRef.current = audio.paused ? 0 : requestAnimationFrame(sync);
    };
    const begin = () => {
      if (!frameRef.current) frameRef.current = requestAnimationFrame(sync);
    };
    const fallback = () => sync();
    const seeking = () => { coverageStartSeenRef.current = false; };
    audio.addEventListener("play", begin);
    audio.addEventListener("timeupdate", fallback);
    audio.addEventListener("seeking", seeking);
    audio.addEventListener("seeked", fallback);
    begin();
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      audio.removeEventListener("play", begin);
      audio.removeEventListener("timeupdate", fallback);
      audio.removeEventListener("seeking", seeking);
      audio.removeEventListener("seeked", fallback);
    };
  }, [manifest, markCoverage, saveHandBoundary, turnState]);

  useEffect(() => {
    if (!started) return;
    const heartbeat = window.setInterval(() => {
      if (!ownsLeaseRef.current) return;
      // Do not change checkpointVersion while a boundary request may need an
      // idempotent retry with the same event body.
      if (handCheckpointRef.current) return;
      if (navigator.onLine) void flushAttended("heartbeat");
      try {
        localStorage.setItem(`univai:demo-owner:${lectureId}`, JSON.stringify({ tabId: tabIdRef.current, expiresAt: Date.now() + LEASE_MS }));
      } catch { /* server ownership still applies */ }
    }, 5_000);
    return () => window.clearInterval(heartbeat);
  }, [flushAttended, lectureId, started, turnState]);

  useEffect(() => {
    if (!manifest || ready) return;
    const timer = window.setTimeout(() => setProblem("The lecturer did not become ready in time. Please retry."), 20_000);
    return () => window.clearTimeout(timer);
  }, [manifest, ready]);

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current) window.clearTimeout(stallTimerRef.current);
    stallTimerRef.current = 0;
  }, []);

  const noteAudioStall = useCallback(() => {
    if (stallTimerRef.current) return;
    stallTimerRef.current = window.setTimeout(() => {
      stallTimerRef.current = 0;
      audioRef.current?.pause();
      setProblem("The lecture connection timed out. Your progress is safe; retry when the connection is stable.");
    }, 15_000);
  }, []);

  useEffect(() => {
    if (!warning || warning.startsWith("You are offline")) return;
    const timer = window.setTimeout(() => setWarning(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [warning]);

  useEffect(() => {
    const offline = () => {
      audioRef.current?.pause();
      setWarning("You are offline. Your progress is safe; resume after reconnecting.");
    };
    const online = () => {
      setWarning("You are back online. Reconnecting to the lecturer…");
      if (handCheckpointRef.current && pendingHandCueRef.current === null) {
        void saveHandBoundary(handCheckpointRef.current.cue)
          .then(() => setWarning(null))
          .catch(() => undefined);
        return;
      }
      // Do not restart narration underneath a question or answer.
      if (handOpenRef.current && pendingHandCueRef.current === null) {
        setWarning(null);
        return;
      }
      void audioRef.current?.play().then(() => setWarning(null)).catch(() => undefined);
    };
    const pagehide = () => {
      if (!serverActiveRef.current || !descriptorRef.current || !checkpointRef.current) return;
      const seconds = Math.min(15, Math.max(0, playedSecondsRef.current));
      navigator.sendBeacon?.(`/api/lecture/${lectureId}/demo`, new Blob([JSON.stringify({
        type: "leave",
        eventId: leaveEventIdRef.current,
        sessionId: sessionIdRef.current,
        scriptDigest: descriptorRef.current.scriptDigest,
        currentCue: Math.min(activeCueRef.current, checkpointRef.current.furthestCompletedCue),
        furthestCompletedCue: checkpointRef.current.furthestCompletedCue,
        checkpointVersion: checkpointRef.current.checkpointVersion,
        attendedSeconds: seconds,
      })], { type: "application/json" }));
      releaseLease();
      serverActiveRef.current = false;
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    window.addEventListener("pagehide", pagehide);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.removeEventListener("pagehide", pagehide);
    };
  }, [flushAttended, lectureId, releaseLease, saveHandBoundary, started]);

  const endLecture = useCallback(async () => {
    if (!manifestRef.current) return;
    markCoverage(manifestRef.current.audio.durationMs);
    await mutationQueueRef.current;
    if ((checkpointRef.current?.furthestCompletedCue ?? 0) < manifestRef.current.cues.length) {
      setProblem("The lecture ended before all progress was saved. Replay the final sentence, then try again.");
      return;
    }
    try {
      await flushAttended("complete");
      await mutationQueueRef.current;
      releaseLease();
      serverActiveRef.current = false;
      setStarted(false);
      setNarrationStarted(false);
      setLectureCompleted(true);
      setWarning(null);
    } catch (error) {
      setProblem(errorText(error, "Completion could not be saved."));
    }
  }, [flushAttended, markCoverage, releaseLease]);

  const releaseMicrophone = useCallback(() => {
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneStreamRef.current = null;
    setMicTrack(null);
    setMuted(true);
  }, []);

  const stopRecognition = useCallback(() => {
    recognitionAttemptRef.current += 1;
    try { recognitionRef.current?.abort(); } catch { /* already stopped */ }
    recognitionRef.current = null;
    releaseMicrophone();
  }, [releaseMicrophone]);

  const beginRecognition = useCallback(async () => {
    stopRecognition();
    turnSequenceRef.current += 1;
    stopInteractionAudio();
    setSpeechProblem(null);
    setSpeechDetail(null);
    setSpeechState("waiting");
    const host = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Constructor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
    if (!Constructor) {
      setSpeechProblem("Speech recognition is not supported here. Type your question below.");
      setSpeechState("error");
      setTurnState("review");
      return;
    }
    const attempt = recognitionAttemptRef.current;
    let heardText = "";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (attempt !== recognitionAttemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      microphoneStreamRef.current = stream;
      const track = stream.getAudioTracks()[0] ?? null;
      if (!track) throw new Error("No working microphone was found.");
      setMicTrack(track);
      setMuted(false);
    } catch {
      setSpeechProblem("Microphone access is unavailable. Type your question below.");
      setSpeechState("error");
      setTurnState("review");
      releaseMicrophone();
      return;
    }
    const recognition = new Constructor();
    recognition.lang = descriptorRef.current?.locale === "ar" ? "ar-EG" : "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      if (attempt !== recognitionAttemptRef.current) return;
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0]?.transcript ?? "";
      heardText = transcript.trimStart();
      setQuestion(heardText);
      setSpeechState("detected");
      setSpeechDetail(heardText ? `Hearing: ${heardText}` : "Listening…");
      if (Array.from(event.results).some((result) => result.isFinal)) {
        setSpeechState("received");
        setSpeechDetail("Speech captured. Check what I heard, edit it if needed, then send.");
        setTurnState("review");
        releaseMicrophone();
      }
    };
    recognition.onerror = (event) => {
      if (attempt !== recognitionAttemptRef.current) return;
      const labels: Record<string, string> = {
        "not-allowed": "Microphone permission was denied.",
        "service-not-allowed": "Speech recognition is disabled by this browser.",
        "audio-capture": "No working microphone was found.",
        "no-speech": "No speech was heard.",
        network: "Speech recognition could not reach its service.",
        aborted: "Speech recognition stopped.",
        "language-not-supported": "This speech language is not supported.",
      };
      setSpeechProblem(`${labels[event.error ?? ""] ?? "Speech recognition failed."} Type or edit your question below.`);
      setSpeechState(event.error === "no-speech" ? "no_speech" : "error");
      setTurnState("review");
      releaseMicrophone();
    };
    recognition.onend = () => {
      if (attempt !== recognitionAttemptRef.current) return;
      recognitionRef.current = null;
      releaseMicrophone();
      setTurnState((state) => {
        if (state !== "listening" && state !== "processing") return state;
        if (!heardText) {
          setSpeechState("no_speech");
          setSpeechProblem("No speech was heard. Type your question below or try again.");
        }
        return "review";
      });
    };
    recognitionRef.current = recognition;
    setTurnState("listening");
    try {
      recognition.start();
    } catch {
      setSpeechProblem("The microphone could not start. Type your question below.");
      setSpeechState("error");
      setTurnState("review");
      releaseMicrophone();
    }
  }, [releaseMicrophone, stopInteractionAudio, stopRecognition]);

  const resumeNarration = useCallback(async (cueIndex = resumeCueRef.current) => {
    handAttemptRef.current += 1;
    handOpenRef.current = false;
    pendingHandCueRef.current = null;
    handCheckpointRef.current = null;
    stopRecognition();
    questionControllerRef.current?.abort();
    turnSequenceRef.current += 1;
    stopInteractionAudio();
    setAmbiguity(null);
    setConfirmPreviousWeek(false);
    setTurnMessage(null);
    setTurnState("idle");
    setQuestion("");
    setSpeechProblem(null);
    setSpeechState(null);
    setSpeechDetail(null);
    if (cueIndex >= (manifestRef.current?.cues.length ?? Number.POSITIVE_INFINITY)) {
      await endLecture();
      return;
    }
    setCuePosition(cueIndex);
    try {
      await audioRef.current?.play();
    } catch {
      setTurnState("idle");
      setWarning("The lecturer's audio is reconnecting…");
      const retry = () => {
        window.removeEventListener("pointerdown", retry, true);
        window.removeEventListener("keydown", retry, true);
        void audioRef.current?.play().then(() => setWarning(null)).catch(() => undefined);
      };
      window.addEventListener("pointerdown", retry, { once: true, capture: true });
      window.addEventListener("keydown", retry, { once: true, capture: true });
    }
  }, [endLecture, setCuePosition, stopInteractionAudio, stopRecognition]);

  const speakAnswer = useCallback((answerAudioUrl: string | null | undefined) => {
    const attempt = ++turnSequenceRef.current;
    const pause = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
    void (async () => {
      try {
        if (!answerAudioUrl) throw new Error("The Piper answer audio was unavailable.");
        await playInteractionClip(answerAudioUrl);
        if (attempt !== turnSequenceRef.current) return;
        await pause(1_600);
        if (attempt !== turnSequenceRef.current) return;
        const transitionUrl = descriptorRef.current?.answerResumeUrl;
        if (!transitionUrl) throw new Error("The lecturer transition audio was unavailable.");
        await playInteractionClip(transitionUrl);
        if (attempt !== turnSequenceRef.current) return;
        await pause(900);
        if (attempt === turnSequenceRef.current) await resumeNarration();
      } catch (error) {
        if (attempt !== turnSequenceRef.current || (error instanceof DOMException && error.name === "AbortError")) return;
        setSpeechProblem("The Piper lecturer audio could not play. The answer remains visible.");
        await pause(1_200);
        if (attempt === turnSequenceRef.current) await resumeNarration();
      }
    })();
  }, [playInteractionClip, resumeNarration]);

  const applyCommand = useCallback(async (command: NonNullable<QuestionResponse["command"]>) => {
    if (command.kind === "seek" || command.kind === "resume") {
      await resumeNarration(command.cueIndex ?? resumeCueRef.current);
      if (command.message) setWarning(command.message);
      return;
    }
    if (command.kind === "clarify_previous") {
      setTurnMessage(null);
      setAmbiguity(command);
      setTurnState("review");
      return;
    }
    if (command.kind === "confirm_previous_week") {
      setTurnMessage(null);
      setConfirmPreviousWeek(true);
      setTurnState("review");
      return;
    }
    const message = command.message ?? "That command is unavailable.";
    const attempt = ++turnSequenceRef.current;
    setTurnMessage(message);
    setTurnState("answering");
    window.setTimeout(() => {
      if (attempt === turnSequenceRef.current) void resumeNarration();
    }, 2_500);
  }, [resumeNarration]);

  const sendQuestion = useCallback(async (questionText: string) => {
    const currentManifest = manifestRef.current;
    const currentDescriptor = descriptorRef.current;
    const value = questionText.trim();
    if (!value || !currentManifest || !currentDescriptor || turnState === "processing") return;
    setQuestion(value);
    stopRecognition();
    const controller = new AbortController();
    questionControllerRef.current?.abort();
    questionControllerRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), QUESTION_TIMEOUT_MS);
    setTurnState("processing");
    setSpeechProblem(null);
    try {
      if (pendingHandCueRef.current !== null) {
        throw new Error("The lecturer is still finishing the current sentence. Please retry in a moment.");
      }
      if (handCheckpointRef.current) {
        await saveHandBoundary(handCheckpointRef.current.cue, false);
      }
      // Repair a turn opened by the old client, which could leave the visual
      // cue ahead of the last sentence actually saved.
      if (turnContextCueRef.current > furthestQueuedRef.current) {
        const recoveryCue = Math.min(currentManifest.cues.length - 1, furthestQueuedRef.current);
        handAttemptRef.current += 1;
        handOpenRef.current = true;
        handCheckpointRef.current = { cue: recoveryCue, eventId: crypto.randomUUID(), promise: null };
        pendingHandCueRef.current = recoveryCue;
        turnContextCueRef.current = recoveryCue;
        resumeCueRef.current = recoveryCue;
        setCuePosition(recoveryCue);
        setSpeechProblem("The lecturer is replaying the last saved sentence before taking your question.");
        setTurnState("waiting");
        await audioRef.current?.play();
        return;
      }
      const cue = currentManifest.cues[Math.min(currentManifest.cues.length - 1, Math.max(0, turnContextCueRef.current))];
      const requestKey = `${currentDescriptor.scriptDigest}:${cue.id}:${value}`;
      const requestId = questionRequestRef.current?.key === requestKey
        ? questionRequestRef.current.id
        : crypto.randomUUID();
      questionRequestRef.current = { key: requestKey, id: requestId };
      const response = await fetch(`/api/lecture/${lectureId}/question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ requestId, question: value, scriptDigest: currentDescriptor.scriptDigest, currentCue: cue.flatCueIndex, slide: cue.slide }),
      });
      const body = await response.json().catch(() => ({})) as QuestionResponse;
      if (!response.ok) throw new Error(body.error ?? "The question could not be answered. No Credits were charged.");
      if (body.kind === "command" && body.command) {
        questionRequestRef.current = null;
        await applyCommand(body.command);
      } else if (body.kind === "answer" && body.turn) {
        questionRequestRef.current = null;
        setTurnMessage(null);
        setAnswers((previous) => appendLiveAnswerTurn(previous, body.turn!));
        setCurrentAnswerId(body.turn.id);
        if (body.feedbackTarget) {
          setAnswerFeedback((previous) => ({
            ...previous,
            [body.turn!.id]: { target: body.feedbackTarget!, submitted: false },
          }));
        }
        setAnswerOutput(body.feedbackTarget ? { citations: [], feedbackTarget: body.feedbackTarget } : null);
        setTurnState("answering");
        speakAnswer(body.answerAudioUrl);
      } else throw new Error("The answer response was incomplete.");
    } catch (error) {
      if (controller.signal.aborted) setSpeechProblem("The answer timed out or was cancelled. No Credits were charged.");
      else setSpeechProblem(errorText(error, "The question could not be answered. No Credits were charged."));
      setTurnState("review");
    } finally {
      window.clearTimeout(timer);
      if (questionControllerRef.current === controller) questionControllerRef.current = null;
    }
  }, [applyCommand, lectureId, saveHandBoundary, setCuePosition, speakAnswer, stopRecognition, turnState]);

  const raiseHand = useCallback(async () => {
    const audio = audioRef.current;
    const currentManifest = manifestRef.current;
    if (
      !narrationStarted
      || turnState !== "idle"
      || !audio
      || !currentManifest
      || handOpenRef.current
      || pendingHandCueRef.current !== null
    ) return;
    if (furthestQueuedRef.current >= currentManifest.cues.length) {
      await endLecture();
      return;
    }
    let cue = activeCueRef.current;
    if (cue > furthestQueuedRef.current) {
      cue = furthestQueuedRef.current;
      setCuePosition(cue);
      setWarning("Restoring the last saved sentence before the lecturer listens…");
    }
    handAttemptRef.current += 1;
    handOpenRef.current = true;
    handCheckpointRef.current = { cue, eventId: crypto.randomUUID(), promise: null };
    pendingHandCueRef.current = cue;
    turnContextCueRef.current = cue;
    // Only advance this after the sentence boundary is confirmed by the server.
    resumeCueRef.current = cue;
    setSpeechProblem(null);
    setSpeechState(null);
    setTurnState("waiting");
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setSpeechProblem("The lecturer could not finish the sentence. Retry or cancel safely.");
        setSpeechState("error");
        setTurnState("review");
      }
    }
  }, [endLecture, narrationStarted, setCuePosition, turnState]);

  const retryQuestionFlow = useCallback(async () => {
    if (pendingHandCueRef.current !== null) {
      setSpeechProblem(null);
      setSpeechState(null);
      setTurnState("waiting");
      try {
        await audioRef.current?.play();
      } catch {
        setSpeechProblem("The lecturer could not finish the sentence. Retry or cancel safely.");
        setSpeechState("error");
        setTurnState("review");
      }
      return;
    }
    if (handCheckpointRef.current) {
      await saveHandBoundary(handCheckpointRef.current.cue).catch(() => undefined);
      return;
    }
    await beginRecognition();
  }, [beginRecognition, saveHandBoundary]);

  const toggleMicrophone = useCallback(async () => {
    if (turnState === "listening") {
      setMuted(true);
      setSpeechState("processing");
      setSpeechDetail("Finishing your question…");
      setTurnState("processing");
      recognitionRef.current?.stop();
      return;
    }
    if (turnState === "ready" || turnState === "review") await beginRecognition();
  }, [beginRecognition, turnState]);

  const cancelQuestion = useCallback(async () => {
    if (turnState === "waiting" && pendingHandCueRef.current !== null) {
      handAttemptRef.current += 1;
      handOpenRef.current = false;
      pendingHandCueRef.current = null;
      handCheckpointRef.current = null;
      setTurnState("idle");
      return;
    }
    questionControllerRef.current?.abort();
    await resumeNarration();
  }, [resumeNarration, turnState]);

  if (problem && !descriptor) {
    return <Alert severity="error" action={<Button color="inherit" onClick={() => window.location.reload()}>Retry</Button>}><AlertTitle>Lecture unavailable</AlertTitle>{problem}</Alert>;
  }
  if (!descriptor || !manifest || !checkpoint) {
    return <Stack spacing={2} role="status" aria-live="polite"><LinearProgress /><Typography>Joining your lecture…</Typography></Stack>;
  }
  const cue = manifest.cues[activeCue];
  const joining = joinRemaining !== 0;
  const completed = lectureCompleted || checkpoint.completed;
  const agentState: AgentState = !narrationStarted
    ? started ? "preparing" : "connecting"
    : ({
        idle: "lecturing",
        waiting: "asking",
        ready: "asking",
        listening: "listening",
        review: "review",
        processing: "processing",
        answering: "answering",
      } satisfies Record<TurnState, AgentState>)[turnState];
  const hand = turnState === "waiting"
    ? "raised"
    : turnState === "ready" || turnState === "listening" || turnState === "review" || turnState === "processing"
      ? "acked"
      : "idle";

  return (
    <Stack spacing={3} dir={descriptor.locale === "ar" ? "rtl" : "ltr"}>
      <audio
        ref={audioRef}
        src={descriptor.audioUrl}
        preload="metadata"
        onLoadedMetadata={() => setReady(true)}
        onError={() => setProblem("The lecturer's audio could not be loaded. Please retry.")}
        onCanPlay={clearStallTimer}
        onPlaying={clearStallTimer}
        onWaiting={noteAudioStall}
        onStalled={noteAudioStall}
        onPause={() => { clearStallTimer(); lastFrameAtRef.current = null; if (narrationStarted && turnState === "idle") void flushAttended("pause"); }}
        onEnded={() => void endLecture()}
      />

      <Stack spacing={1}>
        <Typography variant="overline">Week {descriptor.lecture.week} · Live lecture</Typography>
        <Typography variant="h4" data-generated-content="true" dir="auto">{descriptor.lecture.title}</Typography>
        <Stack direction="row" spacing={1} useFlexGap style={{ flexWrap: "wrap" }}>
          <Chip color={completed ? "success" : narrationStarted ? "primary" : "default"} label={completed ? "Lecture finished" : narrationStarted ? STATE_LABEL[agentState] : started ? "Preparing presentation…" : joining ? "Connecting…" : ready ? "Lecturer ready" : "Connecting…"} />
          <Chip label={`Slide ${cue.slide}`} />
        </Stack>
      </Stack>

      {problem ? <Alert severity="error" action={<Button color="inherit" onClick={() => window.location.reload()}>Retry</Button>}>{problem}</Alert> : null}
      {warning ? <Alert severity="warning" onClose={() => setWarning(null)}>{warning}</Alert> : null}

      {!started && !completed ? <Stack spacing={1} role="status"><LinearProgress /><Typography>{starting ? "Joining your lecture…" : "Connecting to your lecturer…"}</Typography></Stack> : null}

      {completed ? (
        <Alert severity="success" action={<Button href="/dashboard" color="inherit">Go to dashboard</Button>}>
          <AlertTitle>Lecture finished</AlertTitle>
          Your lecture and attendance are saved.
        </Alert>
      ) : null}

      {started ? (
        <>
          <LectureSlides lectureId={lectureId} slide={cue.slide} onReady={markPresentationReady} />
          <Card variant="outlined"><CardContent><Stack spacing={1} aria-live="polite">
            <Typography variant="overline">Slide {cue.slide} · Caption</Typography>
            <Typography variant="h6" data-generated-content="true" dir="auto">{cue.text}</Typography>
            {cue.pages.length ? <Typography variant="body2" color="text.secondary">Source {cue.pages.map((page) => `p. ${page}`).join(", ")}</Typography> : null}
          </Stack></CardContent></Card>
        </>
      ) : null}

      {started && (ambiguity?.kind === "clarify_previous" || confirmPreviousWeek) ? (
        <Card variant="outlined"><CardContent><Stack spacing={2}>
          {ambiguity?.kind === "clarify_previous" ? (
            <Stack spacing={1}>
              <Alert severity="info">Which earlier material do you mean?</Alert>
              <Stack direction="row" spacing={1} useFlexGap style={{ flexWrap: "wrap" }}>
                <Button variant="outlined" onClick={() => void resumeNarration(Math.max(0, checkpoint.furthestCompletedCue - 1))}>Last sentence</Button>
                <Button variant="outlined" disabled={ambiguity.previousSlideCue === null} onClick={() => void resumeNarration(ambiguity.previousSlideCue ?? 0)}>Previous slide</Button>
                <Button variant="outlined" disabled={!ambiguity.previousWeekAvailable} onClick={() => setConfirmPreviousWeek(true)}>Previous week</Button>
              </Stack>
            </Stack>
          ) : null}

          {confirmPreviousWeek ? (
            <Alert severity="warning" action={<Stack direction="row" spacing={1}><Button color="inherit" disabled={!descriptor.previousLecture} onClick={() => descriptor.previousLecture && window.location.assign(`/lecture/${descriptor.previousLecture.id}/archive`)}>Open archive</Button><Button color="inherit" onClick={() => setConfirmPreviousWeek(false)}>Stay here</Button></Stack>}>
              Your place in this lecture is saved. Open the previous week’s read-only lecture archive?
            </Alert>
          ) : null}
        </Stack></CardContent></Card>
      ) : null}

      {narrationStarted ? (
        <RaiseHandDock
          connected
          micBlocked={false}
          mic={micTrack}
          muted={muted}
          hand={hand}
          agentState={agentState}
          speechState={speechState}
          speechDetail={speechDetail}
          problem={speechProblem}
          progressDetail={turnState === "answering" ? turnMessage ?? "Lecturer is answering your question…" : null}
          transcript={turnState === "review" ? question : null}
          answers={answers}
          answerOutput={answerOutput}
          answerFeedback={answerFeedback}
          metadataMessage={metadataMessage}
          onRaiseHand={raiseHand}
          onToggleMute={toggleMicrophone}
          onRetry={retryQuestionFlow}
          onCancel={cancelQuestion}
          onSend={sendQuestion}
          onDismissProblem={() => setSpeechProblem(null)}
          onFeedbackSent={(answerId) => setAnswerFeedback((previous) => {
            const feedback = previous[answerId];
            return feedback ? { ...previous, [answerId]: { ...feedback, submitted: true } } : previous;
          })}
          onAnswerRegenerated={(turn, output) => {
            setAnswers((previous) => appendLiveAnswerTurn(previous, turn));
            setCurrentAnswerId(turn.id);
            setAnswerOutput(output);
            setAnswerFeedback((previous) => ({
              ...previous,
              [turn.id]: {
                target: output.feedbackTarget,
                submitted: previous[turn.id]?.submitted ?? false,
              },
            }));
            setMetadataMessage(null);
          }}
        />
      ) : null}
    </Stack>
  );
}
