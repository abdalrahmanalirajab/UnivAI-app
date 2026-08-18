export const MAX_VISIBLE_RAISE_HAND_TURNS = 20;

export type LiveAnswerTurn = {
  id: string;
  question: string;
  answer: string;
  pages: number[];
  slide: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate the Live data-channel payload before it enters React state. */
export function parseLiveAnswerTurn(
  value: unknown,
  fallbackId: string,
): LiveAnswerTurn | null {
  if (!isRecord(value)) return null;
  const question = typeof value.question === "string" ? value.question.trim() : "";
  const answer = typeof value.answer === "string" ? value.answer.trim() : "";
  if (!question || !answer) return null;

  const pages = Array.isArray(value.pages)
    ? [...new Set(value.pages.filter(
        (page): page is number => Number.isInteger(page) && Number(page) > 0,
      ))]
    : [];
  const slide = Number.isInteger(value.slide) && Number(value.slide) > 0
    ? Number(value.slide)
    : null;
  const id = typeof value.turn_id === "string" && value.turn_id.trim()
    ? value.turn_id.trim()
    : fallbackId;

  return { id, question, answer, pages, slide };
}

/** Append exactly once and keep long lectures from growing browser state forever. */
export function appendLiveAnswerTurn(
  turns: LiveAnswerTurn[],
  incoming: LiveAnswerTurn,
  limit = MAX_VISIBLE_RAISE_HAND_TURNS,
): LiveAnswerTurn[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("conversation limit must be a positive integer");
  }
  const existing = turns.findIndex((turn) => turn.id === incoming.id);
  if (existing >= 0) {
    const next = [...turns];
    next[existing] = incoming;
    return next;
  }
  return [...turns, incoming].slice(-limit);
}
