"use client";

import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import type { SlideDeck } from "@/lib/lectures";

export default function LectureSlides({ lectureId, slide }: { lectureId: string; slide: number }) {
  const [deck, setDeck] = useState<SlideDeck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    fetch(`/api/lecture/${lectureId}/slides`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not load slides.");
        setDeck(body.deck);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [lectureId]);

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

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!deck) return <CircularProgress />;
  return (
    <iframe
      ref={frameRef}
      src={`/api/presentation/${deck.presentationId}/${slide}`}
      title={`Week ${deck.week}: ${deck.title}`}
      width="100%"
      height="520"
      frameBorder="0"
      allowFullScreen
    />
  );
}
