import { describe, expect, it } from "vitest";
import {
  appendLiveAnswerTurn,
  parseLiveAnswerTurn,
  type LiveAnswerTurn,
} from "@/lib/live-conversation";

function turn(id: string): LiveAnswerTurn {
  return {
    id,
    question: `question ${id}`,
    answer: `answer ${id}`,
    pages: [],
    slide: 1,
  };
}

describe("live raise-hand conversation", () => {
  it("parses the contextual answer envelope from Live", () => {
    expect(parseLiveAnswerTurn({
      turn_id: "turn-3",
      question: " Explain it again ",
      answer: " Here is a simpler example. ",
      pages: [4, 4, -1, "5"],
      slide: 3,
    }, "fallback")).toEqual({
      id: "turn-3",
      question: "Explain it again",
      answer: "Here is a simpler example.",
      pages: [4],
      slide: 3,
    });
  });

  it("keeps compatibility with answer envelopes sent by an older worker", () => {
    expect(parseLiveAnswerTurn({
      question: "What is hashing?",
      answer: "It maps a key to a bucket.",
      pages: [2],
    }, "legacy-1")).toMatchObject({ id: "legacy-1", slide: null });
  });

  it("rejects malformed messages instead of showing a broken chat turn", () => {
    expect(parseLiveAnswerTurn({ question: "", answer: "answer" }, "bad")).toBeNull();
    expect(parseLiveAnswerTurn({ question: "question" }, "bad")).toBeNull();
  });

  it("deduplicates reliable delivery by turn id", () => {
    const updated = { ...turn("one"), answer: "updated answer" };
    expect(appendLiveAnswerTurn([turn("one")], updated)).toEqual([updated]);
  });

  it("keeps only the configured number of recent visible turns", () => {
    expect(appendLiveAnswerTurn([turn("one"), turn("two")], turn("three"), 2))
      .toEqual([turn("two"), turn("three")]);
  });
});
