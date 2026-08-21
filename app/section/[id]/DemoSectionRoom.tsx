"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
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
import MicRounded from "@mui/icons-material/MicRounded";
import OutputFeedback from "@/app/components/OutputFeedback";
import { validateDemoSectionManifest, type DemoSectionManifest } from "@/lib/demo-media-contract";
import type { AiOutputTarget } from "@/lib/ai-output-feedback-types";

type SectionAnswer = {
  activityIndex: number;
  submissionId: string;
  text: string;
  feedback: string;
  citations: Array<Record<string, unknown>>;
};

type SessionState = {
  exists: boolean;
  state: "intro" | "example" | "guided_task" | "waiting" | "feedback" | "todo_recap" | "completed" | "interrupted" | "failed";
  nodeIndex: number;
  completedNodeIds: string[];
  answers: SectionAnswer[];
  acknowledgedTodos: number[];
  eventVersion: number;
  resumed: boolean;
  attendanceChanged: false;
};

type Descriptor = {
  section: {
    id: string;
    week: number;
    title: string;
    totalMinutes: number;
    objectives: string[];
    todos: Array<Record<string, unknown>>;
    payloadHash: string;
    planVersion: number;
    feedbackTarget: AiOutputTarget;
  };
  manifestUrl: string;
  welcomeBackUrl: string;
  nodeMediaBaseUrl: string;
  session: SessionState;
  locale: "en" | "ar";
};

type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: Event & { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => RecognitionLike;

class SectionRequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string | null) {
    super(message);
    this.name = "SectionRequestError";
  }
}

async function jsonRequest(url: string, init: RequestInit, timeout = 15_000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new SectionRequestError(typeof body.error === "string" ? body.error : "The section request failed.", response.status, typeof body.code === "string" ? body.code : null);
    return body;
  } finally {
    window.clearTimeout(timer);
  }
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function loadSectionDescriptor(sectionId: string): Promise<Descriptor> {
  try {
    return await jsonRequest(`/api/section/${sectionId}/demo`, { cache: "no-store" }) as unknown as Descriptor;
  } catch (error) {
    if (!(error instanceof SectionRequestError) || !["MEDIA_INVALID", "MEDIA_NOT_PREPARED"].includes(error.code ?? "")) throw error;
    await pause(750);
    return await jsonRequest(`/api/section/${sectionId}/demo`, { cache: "no-store" }) as unknown as Descriptor;
  }
}

export default function DemoSectionRoom({ sectionId }: { sectionId: string }) {
  const [descriptor, setDescriptor] = useState<Descriptor | null>(null);
  const [manifest, setManifest] = useState<DemoSectionManifest | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [followUpAnswer, setFollowUpAnswer] = useState<{ answer: string; citations: Array<Record<string, unknown>>; feedbackTarget: AiOutputTarget } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const descriptorRef = useRef<Descriptor | null>(null);
  const manifestRef = useRef<DemoSectionManifest | null>(null);
  const sessionRef = useRef<SessionState | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const leavingRef = useRef(false);
  const submissionRef = useRef<{ key: string; id: string } | null>(null);
  const followUpRequestRef = useRef<{ key: string; id: string } | null>(null);

  const updateSession = useCallback((next: SessionState) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const body = await loadSectionDescriptor(sectionId);
        let manifestResponse = await fetch(body.manifestUrl, { cache: "no-store" });
        if (!manifestResponse.ok) {
          await pause(500);
          manifestResponse = await fetch(body.manifestUrl, { cache: "no-store" });
        }
        if (!manifestResponse.ok) throw new Error("The section room could not finish loading.");
        const parsed = validateDemoSectionManifest(await manifestResponse.json(), {
          sectionPackId: body.section.id,
          planVersion: body.section.planVersion,
          payloadHash: body.section.payloadHash,
        });
        if (!active) return;
        descriptorRef.current = body;
        manifestRef.current = parsed;
        sessionRef.current = body.session;
        setDescriptor(body);
        setManifest(parsed);
        setSession(body.session);
        setReady(true);
      } catch (error) {
        if (active) setProblem(error instanceof Error ? error.message : "The section could not be loaded.");
      }
    };
    void load();
    return () => { active = false; };
  }, [sectionId]);

  const action = useCallback(async (type: string, fields: Record<string, unknown> = {}) => {
    const current = sessionRef.current;
    if (!current) throw new Error("Section state is not ready.");
    let body: Record<string, unknown>;
    try {
      body = await jsonRequest(`/api/section/${sectionId}/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, idempotencyKey: crypto.randomUUID(), eventVersion: current.eventVersion, ...fields }),
      });
    } catch (error) {
      if (error instanceof SectionRequestError && error.code === "STALE_VERSION") {
        const refreshed = await jsonRequest(`/api/section/${sectionId}/demo`, { cache: "no-store" }) as unknown as Descriptor;
        updateSession(refreshed.session);
        throw new Error(`${error.message} The latest saved state has been loaded.`);
      }
      throw error;
    }
    const next = body.session as SessionState | undefined;
    if (!next) throw new Error("The section state response was incomplete.");
    updateSession(next);
    return next;
  }, [sectionId, updateSession]);

  const playNode = useCallback(async (next: SessionState) => {
    const audio = audioRef.current;
    const currentManifest = manifestRef.current;
    const currentDescriptor = descriptorRef.current;
    if (!audio || !currentManifest || !currentDescriptor || next.nodeIndex >= currentManifest.nodes.length || next.state === "waiting" || next.state === "feedback" || next.state === "completed") return;
    const node = currentManifest.nodes[next.nodeIndex];
    audio.src = `${currentDescriptor.nodeMediaBaseUrl}${encodeURIComponent(node.id)}`;
    audio.load();
    try {
      await Promise.race([
        audio.play(),
        new Promise<never>((_resolve, reject) => window.setTimeout(() => reject(new Error("The lecturer took too long to respond.")), 20_000)),
      ]);
      setWarning(null);
    } catch {
      setWarning("The lecturer paused. Press Continue when you are ready.");
    }
  }, []);

  const start = useCallback(async () => {
    if (busy || !descriptorRef.current || !sessionRef.current) return;
    setBusy(true);
    setProblem(null);
    try {
      const wasResume = sessionRef.current.exists && sessionRef.current.state !== "completed";
      const next = await action(sessionRef.current.state === "interrupted" ? "resume" : "start");
      setStarted(true);
      if (wasResume) {
        const welcome = new Audio(descriptorRef.current.welcomeBackUrl);
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error("The lecturer's welcome took too long.")), 20_000);
          welcome.onended = () => { window.clearTimeout(timer); resolve(); };
          welcome.onerror = () => { window.clearTimeout(timer); reject(new Error("The lecturer's welcome could not be heard.")); };
          welcome.play().catch(reject);
        });
      }
      await playNode(next);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The section could not start.");
    } finally {
      setBusy(false);
    }
  }, [action, busy, playNode]);

  const advance = useCallback(async () => {
    const currentManifest = manifestRef.current;
    const current = sessionRef.current;
    if (!currentManifest || !current || current.nodeIndex >= currentManifest.nodes.length || busy) return;
    setBusy(true);
    try {
      const next = await action("advance", { nodeId: currentManifest.nodes[current.nodeIndex].id });
      await playNode(next);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The section step could not be saved.");
    } finally {
      setBusy(false);
    }
  }, [action, busy, playNode]);

  const submit = useCallback(async () => {
    const currentManifest = manifestRef.current;
    const current = sessionRef.current;
    const text = answer.trim();
    if (!currentManifest || !current || !text || busy) return;
    const node = currentManifest.nodes[current.nodeIndex];
    if (!node || node.activityIndex === null) return;
    setBusy(true);
    try {
      const submissionKey = `${descriptorRef.current?.section.payloadHash}:${node.activityIndex}:${text}`;
      const submissionId = submissionRef.current?.key === submissionKey ? submissionRef.current.id : crypto.randomUUID();
      submissionRef.current = { key: submissionKey, id: submissionId };
      const next = await action("submit", { activityIndex: node.activityIndex, submissionId, text });
      submissionRef.current = null;
      setAnswer("");
      await playNode(next);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The answer could not be saved.");
    } finally {
      setBusy(false);
    }
  }, [action, answer, busy, playNode]);

  const beginRecognition = useCallback(() => {
    try { recognitionRef.current?.abort(); } catch { /* already stopped */ }
    const host = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Constructor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
    if (!Constructor) {
      setWarning("Speech recognition is unavailable. Type your answer below.");
      return;
    }
    const recognition = new Constructor();
    recognition.lang = descriptorRef.current?.locale === "ar" ? "ar-EG" : "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0]?.transcript ?? "";
      setAnswer(transcript.trimStart());
    };
    recognition.onerror = () => { setWarning("Microphone speech failed. Type or edit your answer below."); setListening(false); };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try { recognition.start(); setListening(true); } catch { setWarning("The microphone could not start. Type your answer below."); }
  }, []);

  const leave = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    audioRef.current?.pause();
    try { await action("leave"); } catch { /* the canonical state remains recoverable */ }
    window.location.assign("/start");
  }, [action]);

  const askFollowUp = useCallback(async () => {
    const currentDescriptor = descriptorRef.current;
    const currentManifest = manifestRef.current;
    const current = sessionRef.current;
    if (!currentDescriptor || !currentManifest || !current || !followUp.trim() || busy) return;
    const node = currentManifest.nodes[Math.min(current.nodeIndex, currentManifest.nodes.length - 1)];
    const questionText = followUp.trim();
    const requestKey = `${currentDescriptor.section.payloadHash}:${node.id}:${questionText}`;
    const requestId = followUpRequestRef.current?.key === requestKey ? followUpRequestRef.current.id : crypto.randomUUID();
    followUpRequestRef.current = { key: requestKey, id: requestId };
    setBusy(true);
    try {
      const body = await jsonRequest(`/api/section/${sectionId}/question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, question: questionText, payloadHash: currentDescriptor.section.payloadHash, nodeId: node.id }),
      }, 45_000) as { answer: string; citations: Array<Record<string, unknown>>; feedbackTarget: AiOutputTarget };
      followUpRequestRef.current = null;
      setFollowUpAnswer(body);
    } catch (error) {
      setWarning(error instanceof Error ? error.message : "The follow-up could not be answered. No Credits were charged.");
    } finally {
      setBusy(false);
    }
  }, [busy, followUp, sectionId]);

  useEffect(() => {
    const pagehide = () => {
      if (!started || leavingRef.current || !sessionRef.current) return;
      leavingRef.current = true;
      fetch(`/api/section/${sectionId}/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ type: "leave", idempotencyKey: crypto.randomUUID(), eventVersion: sessionRef.current.eventVersion }),
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", pagehide);
    return () => window.removeEventListener("pagehide", pagehide);
  }, [sectionId, started]);

  if (problem && !descriptor) return <Alert severity="error" action={<Button color="inherit" onClick={() => window.location.reload()}>Retry</Button>}><AlertTitle>Section unavailable</AlertTitle>{problem}</Alert>;
  if (!descriptor || !manifest || !session) return <Stack spacing={2} role="status"><CircularProgress /><Typography>Joining your section…</Typography></Stack>;
  const currentNode = session.nodeIndex < manifest.nodes.length ? manifest.nodes[session.nodeIndex] : null;
  const visibleNodes = manifest.nodes.filter((node, index) => session.completedNodeIds.includes(node.id) || index === session.nodeIndex);
  const completed = session.state === "completed";

  return (
    <Stack spacing={3} dir={descriptor.locale === "ar" ? "rtl" : "ltr"}>
      <audio ref={audioRef} onEnded={() => void advance()} onError={() => setWarning("The lecturer's voice paused. The activity remains visible; press Continue when ready.")} />
      <Stack spacing={1}>
        <Typography variant="overline">Week {descriptor.section.week} · {descriptor.section.totalMinutes} min · Live section</Typography>
        <Typography variant="h4" data-generated-content="true" dir="auto">{descriptor.section.title}</Typography>
        <Stack direction="row" spacing={1} useFlexGap style={{ flexWrap: "wrap" }}>
          <Chip color={completed ? "success" : started ? "primary" : "default"} label={completed ? "Completed" : started ? "In progress" : "Ready"} />
          <Chip label="Progress saved" />
        </Stack>
      </Stack>
      {problem ? <Alert severity="error" onClose={() => setProblem(null)}>{problem}</Alert> : null}
      {warning ? <Alert severity="warning" onClose={() => setWarning(null)}>{warning}</Alert> : null}

      <Card variant="outlined"><CardContent>
        <Typography variant="h6">Objectives</Typography>
        <List>{descriptor.section.objectives.map((objective) => <ListItem key={objective}><ListItemText primary={objective} /></ListItem>)}</List>
      </CardContent></Card>
      <Card variant="outlined"><CardContent><OutputFeedback target={descriptor.section.feedbackTarget} /></CardContent></Card>

      {!started && !completed ? <Button variant="contained" disabled={!ready || busy} onClick={() => void start()}>{busy ? "Starting…" : session.exists ? "Resume section" : "Start section"}</Button> : null}

      {visibleNodes.map((node, index) => {
        const savedAnswer = node.activityIndex === null ? null : session.answers.find((candidate) => candidate.activityIndex === node.activityIndex);
        const isCurrent = currentNode?.id === node.id;
        return (
          <Card key={node.id} variant="outlined"><CardContent><Stack spacing={2}>
            <Typography variant="overline">{node.state.replace("_", " ")} · Step {index + 1}</Typography>
            <Typography variant="h6" data-generated-content="true" dir="auto">{node.title}</Typography>
            <Typography data-generated-content="true" dir="auto">{node.text}</Typography>
            {node.citations.length ? <Stack direction="row" spacing={1} useFlexGap style={{ flexWrap: "wrap" }}>{node.citations.map((citation, citationIndex) => <Chip key={citationIndex} label={`Page ${String(citation.page ?? "source")}`} />)}</Stack> : null}
            {savedAnswer ? <Alert severity="success"><Typography variant="subtitle2">Your answer</Typography><Typography dir="auto">{savedAnswer.text}</Typography><Typography variant="body2">{savedAnswer.feedback}</Typography></Alert> : null}
            {isCurrent && session.state === "waiting" && !savedAnswer ? (
              <>
                <TextField multiline minRows={4} label="Your answer" value={answer} onChange={(event) => setAnswer(event.target.value)} slotProps={{ htmlInput: { maxLength: 4000, dir: "auto" } }} />
                <Stack direction="row" spacing={1} useFlexGap style={{ flexWrap: "wrap" }}>
                  <Button variant="outlined" startIcon={<MicRounded />} onClick={() => listening ? recognitionRef.current?.stop() : beginRecognition()}>{listening ? "Stop microphone" : "Use microphone"}</Button>
                  <Button variant="contained" disabled={!answer.trim() || busy} onClick={() => void submit()}>{busy ? "Saving…" : "Submit answer"}</Button>
                </Stack>
              </>
            ) : null}
          </Stack></CardContent></Card>
        );
      })}

      {started && currentNode && session.state === "feedback" ? <Button variant="contained" onClick={() => void advance()}>Continue after feedback</Button> : null}
      {started && currentNode && session.state !== "waiting" && session.state !== "feedback" ? <Button variant="outlined" onClick={() => void playNode(session)}>Continue</Button> : null}

      {session.nodeIndex >= manifest.nodes.length && !completed ? (
        <Card variant="outlined"><CardContent><Stack spacing={2}>
          <Typography variant="h6">Next actions</Typography>
          {descriptor.section.todos.map((todo, index) => {
            const done = session.acknowledgedTodos.includes(index);
            return <Button key={index} color={done ? "success" : "primary"} variant={done ? "contained" : "outlined"} disabled={done || busy} onClick={() => void action("todo_ack", { todoIndex: index }).catch((error) => setProblem(error.message))}>{done ? "✓ " : ""}{String(todo.text ?? `Task ${index + 1}`)}</Button>;
          })}
          <Button variant="contained" disabled={busy} onClick={() => void action("complete").catch((error) => setProblem(error.message))}>Complete section</Button>
        </Stack></CardContent></Card>
      ) : null}

      {started && !completed ? (
        <Card variant="outlined"><CardContent><Stack spacing={2}>
          <Typography variant="h6">Ask about this section</Typography>
          <TextField multiline minRows={2} label="Typed follow-up question" value={followUp} onChange={(event) => setFollowUp(event.target.value)} slotProps={{ htmlInput: { maxLength: 2000, dir: "auto" } }} />
          <Button variant="outlined" disabled={!followUp.trim() || busy} onClick={() => void askFollowUp()}>{busy ? "Finding grounded answer…" : "Ask"}</Button>
          {followUpAnswer ? <Alert severity="info"><Stack spacing={1}><Typography dir="auto">{followUpAnswer.answer}</Typography><Stack direction="row" spacing={1} useFlexGap style={{ flexWrap: "wrap" }}>{followUpAnswer.citations.map((citation, index) => <Chip key={index} label={`Page ${String(citation.page ?? "source")}`} />)}</Stack><OutputFeedback target={followUpAnswer.feedbackTarget} /></Stack></Alert> : null}
        </Stack></CardContent></Card>
      ) : null}

      {completed ? <Alert severity="success" action={<Button href="/start" color="inherit">Continue</Button>}>Section completed. Lecture attendance was not changed.</Alert> : null}
      {started && !completed ? <Button color="error" variant="outlined" onClick={() => void leave()}>Leave section</Button> : null}
    </Stack>
  );
}
