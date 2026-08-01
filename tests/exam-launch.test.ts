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

test("rebases an internal Exam service origin onto the configured public origin", () => {
  assert.equal(
    requireTrustedExamLaunchUrl(
      { launch_url: `http://exam-system:3000/exam/exam-123#attempt_token=${TOKEN}` },
      EXAM_ORIGIN
    ),
    `${EXAM_ORIGIN}/exam/exam-123#attempt_token=${TOKEN}`
  );
});

test("does not preserve credentials or an invalid exam path", () => {
  assert.throws(
    () =>
      requireTrustedExamLaunchUrl(
        { launch_url: `http://user:password@exam-system:3000/exam/exam-123#attempt_token=${TOKEN}` },
        EXAM_ORIGIN
      ),
    /untrusted launch URL/
  );
  assert.throws(
    () =>
      requireTrustedExamLaunchUrl(
        { launch_url: `http://exam-system:3000/admin#attempt_token=${TOKEN}` },
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
