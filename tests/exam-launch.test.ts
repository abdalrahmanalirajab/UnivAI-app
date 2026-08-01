import assert from "node:assert/strict";
import test from "node:test";

import { requireTrustedExamLaunchUrl } from "../lib/exam-launch";

const EXAM_ORIGIN = "http://localhost:3200";
const TOKEN = "a".repeat(43);

test("uses the secure launch URL returned by the Exam service", () => {
  const launchUrl = `${EXAM_ORIGIN}/exam/exam-123#attempt_token=${TOKEN}`;

  assert.equal(
    requireTrustedExamLaunchUrl({ launch_url: launchUrl }, EXAM_ORIGIN),
    launchUrl
  );
});

test("rejects the bare exam URL that caused the missing-token failure", () => {
  assert.throws(
    () =>
      requireTrustedExamLaunchUrl(
        { launch_url: `${EXAM_ORIGIN}/exam/exam-123` },
        EXAM_ORIGIN
      ),
    /valid access token/
  );
});

test("rejects a missing launch URL", () => {
  assert.throws(
    () => requireTrustedExamLaunchUrl({ _id: "exam-123" }, EXAM_ORIGIN),
    /secure launch URL/
  );
});

test("rejects launch URLs from another origin", () => {
  assert.throws(
    () =>
      requireTrustedExamLaunchUrl(
        { launch_url: `https://attacker.example/exam/exam-123#attempt_token=${TOKEN}` },
        EXAM_ORIGIN
      ),
    /untrusted launch URL/
  );
});

test("requires the access token in the URL fragment", () => {
  assert.throws(
    () =>
      requireTrustedExamLaunchUrl(
        { launch_url: `${EXAM_ORIGIN}/exam/exam-123?attempt_token=${TOKEN}` },
        EXAM_ORIGIN
      ),
    /valid access token/
  );
});
