import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { COURSE_SIZES } from "../lib/course-size";
import {
  LIVE_INBOUND,
  LIVE_OUTBOUND,
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
  assert.deepEqual(LIVE_INBOUND, ["slide", "state", "answer", "transcript", "progress", "hand"]);
  assert.deepEqual(LIVE_OUTBOUND, ["raise_hand", "mic", "question", "cancel"]);
  assert.equal(LIVE_STATES.includes("ended"), true);
});

test("scenario selection and course sizes are stable", () => {
  assert.equal(normalizeScenario("generation-error"), "generation-error");
  assert.equal(normalizeScenario("unknown"), "happy");
  assert.deepEqual(
    Object.fromEntries(Object.entries(COURSE_SIZES).map(([name, value]) => [name, value.slides])),
    { XS: 3, S: 5, M: 8, L: 12, XL: 16 }
  );
});
