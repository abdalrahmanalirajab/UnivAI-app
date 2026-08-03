/**
 * The issue's final exam demo, end to end:
 *
 *   1. A locked final shows its stated reason
 *   2. Eligibility is satisfied (the mock Exam service flips to eligible)
 *   3. Launch
 *   4. Return to a pending-grade state
 *   5. One VERIFIED grade update — and only after that verification does the
 *      UI reflect "graded"
 *
 * The external Exam service is mocked by a small HTTP server in this spec
 * (per the "mock external services in normal CI" rule), but the mock does NOT
 * bypass Phase 4's real verification: callbacks are signed with the REAL
 * HMAC-SHA256 contract (X-Exam-Signature over the raw body) using the same
 * secret the app server holds, and the app's actual
 * /api/exams/callback route verifies them. A tampered signature is attempted
 * first and must be rejected.
 *
 * Run prerequisites (the app server is started by playwright.config with
 * UNIVAI_MODE=standalone; it needs its Postgres and Mongo running, and the
 * callback secret must be shared with the app):
 *
 *   EXAM_CALLBACK_SECRET=<test secret> npx playwright test e2e/final-exam-journey.spec.ts
 *
 * The app server inherits EXAM_CALLBACK_SECRET from the playwright process,
 * so both sides use the same key.
 */
import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

test.describe.configure({ timeout: 120_000 });

const CALLBACK_SECRET: string = process.env.EXAM_CALLBACK_SECRET ?? "";
if (!CALLBACK_SECRET) {
  throw new Error(
    "e2e/final-exam-journey.spec.ts requires a shared callback secret: " +
      "EXAM_CALLBACK_SECRET=<test secret> npx playwright test e2e/final-exam-journey.spec.ts"
  );
}

const EXAM_ORIGIN = process.env.EXAM_SYSTEM_URL ?? "http://localhost:3200";
const EXAM_PORT = Number(new URL(EXAM_ORIGIN).port || "3200");
const APP_ORIGIN = process.env.E2E_BASE_URL ?? "http://localhost:3117";

const EXAM_ID = "66f0a1b2c3d4e5f60718e001";
const LAUNCH_TOKEN = "x".repeat(43);

/** The Exam service's behaviour as the demo drives it. */
const scenario = {
  phase: "locked" as "locked" | "eligible",
  denialReason: "Final exam is locked until the final lecture completes.",
  started: false,
  studentSid: null as string | null,
};

/* ------------------------------------------------------------------ */
/*  Mock Exam service                                                  */
/* ------------------------------------------------------------------ */

function signedCallback(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/**
 * The mocked external Exam service. It owns eligibility (locked vs eligible),
 * the attempt lifecycle (a started attempt cannot be started again) and the
 * post-submit verdicts, exactly like the real service — the app just relays.
 * Callbacks are delivered by the test acting as the service's webhook sender,
 * signed with the same secret the app verifies with.
 */
function createMockExamService(): Server {
  return createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const pathname = new URL(req.url ?? "/", EXAM_ORIGIN).pathname;

      if (req.method === "POST" && pathname === "/api/exams/final/start") {
        const body = JSON.parse(raw);
        scenario.studentSid = body.student_sid ?? null;
        if (scenario.phase === "locked") {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: scenario.denialReason }));
          return;
        }
        if (scenario.started) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Final exam already attempted" }));
          return;
        }
        scenario.started = true;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            launch_url: `${EXAM_ORIGIN}/exam/${EXAM_ID}#attempt_token=${LAUNCH_TOKEN}`,
            _id: EXAM_ID,
            title: "Final — Demo Course",
            taken: false,
            integrity_status: "clean",
            integrity_state: "active",
          })
        );
        return;
      }

      if (req.method === "POST" && pathname === "/api/exams/mid") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
        return;
      }

      if (req.method === "GET" && pathname === `/exam/${EXAM_ID}`) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>Mock exam session</h1><p>The learner takes the final here.</p></body></html>"
        );
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    });
  });
}

/** Deliver a result webhook exactly as the real service would (signed). */
async function sendResultWebhook(payload: Record<string, unknown>, secret: string = CALLBACK_SECRET) {
  const body = JSON.stringify(payload);
  return fetch(`${APP_ORIGIN}/api/exams/callback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Exam-Signature": signedCallback(body, secret),
    },
    body,
  });
}

function webhook(overrides: Record<string, unknown>): Record<string, unknown> {
  if (!scenario.studentSid) throw new Error("no learner handed to the exam service yet");
  return {
    exam_id: EXAM_ID,
    type: "final",
    title: "Final — Demo Course",
    student_id: "66f0a1b2c3d4e5f60718e000",
    student_sid: scenario.studentSid,
    chapter_id: null,
    total_questions: 10,
    passing_mark: 5,
    passed: false,
    integrity_status: "clean",
    policy_action: "none",
    review_status: "not_required",
    report: { suspicion_score: 0, flagged: false, session_status: "completed", events: [] },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

let mockExamService: Server | null = null;
let pool: Pool | null = null;

test.beforeAll(async () => {
  // The app's own standalone database (the same one the webServer uses).
  pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://univai:univai@127.0.0.1:5434/univai_app_standalone",
  });
  try {
    await pool.query(await readFile("standalone/schema.sql", "utf8"));
  } finally {
    await pool.end();
    pool = null;
  }

  mockExamService = createMockExamService();
  await new Promise<void>((resolve) => mockExamService!.listen(EXAM_PORT, resolve));
});

test.afterAll(async () => {
  const server = mockExamService;
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test.beforeEach(async ({ page }) => {
  scenario.phase = "locked";
  scenario.started = false;
  scenario.studentSid = null;

  const suffix = `${process.pid}-${Date.now()}`;
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: APP_ORIGIN },
    data: {
      email: `final-exam-${suffix}@univai.local`,
      password: "FinalExamTest123!",
      name: "Final Exam Learner",
      phone: "+201000000999",
    },
  });
  expect(signup.ok(), await signup.text()).toBe(true);

  // The exams surface requires a prepared source (the session gate).
  const upload = await page.request.post("/api/upload", {
    multipart: {
      file: {
        name: "prepared-source.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n%%EOF"),
      },
    },
  });
  expect(upload.ok(), await upload.text()).toBe(true);
});

/* ------------------------------------------------------------------ */
/*  The demo                                                           */
/* ------------------------------------------------------------------ */

test("final exam demo: locked reason, eligibility, launch, pending grade, verified grade", async ({
  page,
}) => {
  await page.goto("/exams");
  await expect(page.getByRole("heading", { name: "Exams" })).toBeVisible();

  // Step 1 — the final is locked, with the service's stated reason: the app
  // relays the denial verbatim, never computes one of its own.
  await page.getByRole("button", { name: "Start final exam" }).click();
  await expect(page.getByText(scenario.denialReason)).toBeVisible();

  // Step 2 — satisfy eligibility: the service now says the learner is eligible.
  scenario.phase = "eligible";

  // Step 3 — launch: one launch, popup opens at the service's validated URL,
  // and the page reflects the service-reported "active" attempt.
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Start final exam" }).click();
  const popup = await popupPromise;
  expect(popup.url()).toBe(`${EXAM_ORIGIN}/exam/${EXAM_ID}#attempt_token=${LAUNCH_TOKEN}`);
  await popup.close();

  await expect(page.getByText(/Already in progress — continue in the exam window/)).toBeVisible();
  await expect(page.getByText("active", { exact: true })).toBeVisible();

  // A second launch is refused by the service and surfaced as-is.
  await page.getByRole("button", { name: "Start final exam" }).click();
  await expect(page.getByText("Final exam already attempted")).toBeVisible();

  // Step 4 — return to a pending-grade state: the service's submit event
  // arrives (signed like the real service), the app verifies it and the page
  // shows "awaiting-grade" — with no result yet.
  const pending = webhook({ grading_status: "pending_review", mark: null });
  const pendingResponse = await sendResultWebhook(pending);
  expect(pendingResponse.status, await pendingResponse.text()).toBe(200);

  await page.reload();
  await expect(page.getByText("awaiting-grade", { exact: true })).toBeVisible();
  await expect(page.getByText(/Submitted — awaiting grade from the exam system/)).toBeVisible();
  await expect(page.getByText(/Result /)).toHaveCount(0);

  // Step 5a — a grade claim with a TAMPERED signature is rejected before
  // anything changes; the UI stays pending.
  const forged = webhook({ grading_status: "graded", mark: 4, review_status: "cleared" });
  const tamperedResponse = await sendResultWebhook(forged, "wrong-secret");
  expect(tamperedResponse.status).toBe(401);
  await page.reload();
  await expect(page.getByText("awaiting-grade", { exact: true })).toBeVisible();
  await expect(page.getByText(/Result /)).toHaveCount(0);

  // Step 5b — the one VERIFIED grade update (correct signature) is processed:
  // the grade row and the "graded" status appear only now.
  const verifiedResponse = await sendResultWebhook(forged);
  expect(verifiedResponse.status, await verifiedResponse.text()).toBe(200);

  await page.reload();
  await expect(page.getByText("graded", { exact: true })).toBeVisible();
  await expect(page.getByText("Result 4 / 5 — not passed.")).toBeVisible();
});
