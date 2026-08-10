export const LIVE_STATES = [
  "connecting",
  "preparing",
  "lecturing",
  "asking",
  "listening",
  "processing",
  "review",
  "answering",
  "ended",
] as const;

export const LIVE_SPEECH_STATES = [
  "waiting",
  "detected",
  "processing",
  "received",
  "no_speech",
  "error",
] as const;

export const LIVE_INBOUND = [
  "slide",
  "state",
  "answer",
  "transcript",
  "progress",
  "hand",
  "speech",
  "fallback",
] as const;
export const LIVE_OUTBOUND = ["raise_hand", "mic", "question", "retry", "cancel"] as const;

export type ScriptContract = {
  lectureId: string;
  title: string;
  segments: { slide: number; text: string; citations: { page: number }[] }[];
};

export function validateScript(value: unknown): asserts value is ScriptContract {
  if (!value || typeof value !== "object") throw new Error("script must be an object");
  const script = value as Partial<ScriptContract>;
  if (!script.lectureId || !script.title || !Array.isArray(script.segments) || !script.segments.length) {
    throw new Error("script is missing required fields");
  }
  for (const segment of script.segments) {
    if (
      !Number.isInteger(segment.slide) ||
      segment.slide < 1 ||
      !segment.text ||
      !Array.isArray(segment.citations) ||
      !segment.citations.length
    ) {
      throw new Error("invalid lecture segment");
    }
  }
}
