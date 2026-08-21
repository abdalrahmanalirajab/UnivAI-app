"use client";

import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { SlideDeck } from "@/lib/lectures";

const ACCESS_RETRY_DELAY_MS = 750;
const MAX_ACCESS_RETRIES = 40;

type SlidesResponse = {
  deck?: SlideDeck;
  error?: string;
  code?: string;
  reason?: string | null;
};

export default function LectureSlides({
  lectureId,
  slide,
  onReady,
}: {
  lectureId: string;
  slide: number;
  onReady?: () => void;
}) {
  const [deck, setDeck] = useState<SlideDeck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingAccess, setConfirmingAccess] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    setDeck(null);
    setError(null);
    setConfirmingAccess(false);

    const load = async (attempt = 0): Promise<void> => {
      try {
        const response = await fetch(`/api/lecture/${lectureId}/slides`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as SlidesResponse;
        const waitingForTrustedJoin =
          body.code === "PRESENTATION_LOCKED" && body.reason === "not_joined";

        if (!response.ok && waitingForTrustedJoin && attempt < MAX_ACCESS_RETRIES) {
          if (active) setConfirmingAccess(true);
          retryTimer = setTimeout(() => void load(attempt + 1), ACCESS_RETRY_DELAY_MS);
          return;
        }
        if (!response.ok) {
          throw new Error(
            waitingForTrustedJoin
              ? "We could not confirm presentation access yet. Reconnect to the lecture, then try again."
              : body.error ?? "Could not load slides.",
          );
        }
        if (!body.deck) throw new Error("The presentation response did not include any slides.");
        if (!active) return;
        setDeck(body.deck);
        setConfirmingAccess(false);
      } catch (reason) {
        if (!active || (reason instanceof DOMException && reason.name === "AbortError")) return;
        setError(reason instanceof Error ? reason.message : "Could not load slides.");
      }
    };

    void load();
    return () => {
      active = false;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [lectureId, reloadVersion]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame?.contentWindow || !deck) return;
    const target = `/api/presentation/${deck.presentationId}/${slide}`;
    try {
      const frameWindow = frame.contentWindow;
      if (frameWindow.location.pathname === target) return;
      frameWindow.history.replaceState({}, "", target);
      frameWindow.dispatchEvent(new PopStateEvent("popstate", { state: frameWindow.history.state }));
    } catch {
      frame.src = target;
    }
  }, [deck, slide]);

  if (error) {
    return (
      <Alert
        severity="warning"
        action={
          <Button color="inherit" onClick={() => setReloadVersion((version) => version + 1)}>
            Try again
          </Button>
        }
      >
        <AlertTitle>Presentation not ready yet</AlertTitle>
        {error}
      </Alert>
    );
  }
  if (!deck) {
    return (
      <Stack spacing={1} role="status" aria-live="polite">
        <CircularProgress size={28} />
        <Typography variant="body1">
          {confirmingAccess ? "Confirming your lecture access…" : "Preparing your presentation…"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {confirmingAccess
            ? "Your live connection is being registered. The slides will open automatically."
            : "This normally takes only a moment."}
        </Typography>
      </Stack>
    );
  }

  return (
    <iframe
      ref={frameRef}
      src={`/api/presentation/${deck.presentationId}/${slide}`}
      title={`Week ${deck.week}: ${deck.title}`}
      width="100%"
      height="520"
      frameBorder="0"
      allowFullScreen
      onLoad={onReady}
    />
  );
}
