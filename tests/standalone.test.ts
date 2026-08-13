import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LIVE_INBOUND,
  LIVE_OUTBOUND,
  LIVE_SPEECH_STATES,
  LIVE_STATES,
  validateScript,
} from "../lib/standalone-contracts";
import { normalizeScenario } from "../lib/runtime";

test("all canonical lecture scripts validate", async () => {
  for (let week = 1; week <= 4; week += 1) {
    const source = await readFile(
      new URL(
        `../standalone/lectures/S-2026-000042/week-${week}/script.json`,
        import.meta.url
      ),
      "utf8"
    );
    validateScript(JSON.parse(source));
  }
});

test("live vocabulary remains compatible", () => {
  assert.deepEqual(LIVE_INBOUND, ["slide", "state", "answer", "transcript", "progress", "hand", "speech", "fallback"]);
  assert.deepEqual(LIVE_OUTBOUND, ["raise_hand", "mic", "question", "retry", "cancel", "presence"]);
  assert.deepEqual(LIVE_SPEECH_STATES, ["waiting", "detected", "processing", "received", "no_speech", "error"]);
  assert.equal(LIVE_STATES.includes("processing"), true);
  assert.equal(LIVE_STATES.includes("waiting"), true);
  assert.equal(LIVE_STATES.includes("resuming"), true);
  assert.equal(LIVE_STATES.includes("ended"), true);
});

test("scenario selection is stable", () => {
  assert.equal(normalizeScenario("generation-error"), "generation-error");
  assert.equal(normalizeScenario("unknown"), "happy");
});
