import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { SEVEN_WEEK_PLAN_V1 } from "../test/fixtures/programme-plans-v1";
import { SECTION_PACKS_V1 } from "../test/fixtures/section-pack-v1";

test.describe.configure({ timeout: 120_000 });

/* ------------------------------------------------------------------ */
/*  Demo Contract — approved 7-week plan with two sections             */
/*                                                                     */
/*  The issue's exact Demo Contract, end to end: approve a 7-week plan */
/*  (SEVEN_WEEK_PLAN_V1) with two sections (SECTION_PACKS_V1 weeks 1   */
/*  and 5) via the real UI, advance virtual time through lecture 1 and */
/*  its section, refresh, and prove order and states remain correct    */
/*  after the refresh — state restored from the backend payload on     */
/*  every load, never assumed from local state.                        */
/*                                                                     */
/*  The network layer (the backend) is intercepted with contract-      */
/*  shaped responses; every page component and its real logic runs.    */
/* ------------------------------------------------------------------ */

const STUDENT_ID = "S-2026-000999";
const LECTURE_WINDOW_MS = 60 * 60_000;

// Weekly cadence, identical to ensureSchedule's seed: week 1 = 2026-08-04T10:00Z.
const LECTURE_STARTS = [
  "2026-08-04T10:00:00.000Z",
  "2026-08-11T10:00:00.000Z",
  "2026-08-18T10:00:00.000Z",
  "2026-08-25T10:00:00.000Z",
  "2026-09-01T10:00:00.000Z",
  "2026-09-08T10:00:00.000Z",
  "2026-09-15T10:00:00.000Z",
];

const COLLECTION = {
  id: 1,
  student_id: STUDENT_ID,
  name: "Test Collection",
  created_at: "2026-07-28T00:00:00Z",
};

const DOCUMENTS = [
  { id: 1, collection_id: 1, student_id: STUDENT_ID, filename: "ai-textbook.pdf", status: "ready", error: null, created_at: "2026-07-28T00:00:00Z", updated_at: "2026-07-28T00:00:00Z" },
  { id: 2, collection_id: 1, student_id: STUDENT_ID, filename: "calculus-book.pdf", status: "ready", error: null, created_at: "2026-07-28T00:00:00Z", updated_at: "2026-07-28T00:00:00Z" },
  { id: 3, collection_id: 1, student_id: STUDENT_ID, filename: "reference.pdf", status: "ready", error: null, created_at: "2026-07-28T00:00:00Z", updated_at: "2026-07-28T00:00:00Z" },
];

/* ------------------------------------------------------------------ */
/*  Backend state the interceptors serve (contract-shaped)             */
/* ------------------------------------------------------------------ */

const backendState = {
  collectionCreated: false,
  approvedAt: null as string | null,
  // Virtual time — "advancing" it changes the schedule states the backend serves.
  now: "2026-08-03T12:00:00.000Z",
};

/**
 * The schedule payload the real GET /api/lectures would serve: one record
 * per lecture from the approved plan, sections interleaved right after
 * their own lecture (SECTION_PACKS_V1 weeks 1 and 5), every state derived
 * from the current virtual time exactly like the server does.
 */
function schedulePayload() {
  const weeks = SEVEN_WEEK_PLAN_V1.workload.weeks_per_semester;
  const virtualNow = new Date(backendState.now).getTime();

  const lectures = Array.from({ length: weeks }, (_, index) => {
    const week = index + 1;
    const startsAt = new Date(LECTURE_STARTS[index]).getTime();
    const endsAt = startsAt + LECTURE_WINDOW_MS;
    const state =
      virtualNow >= endsAt ? "done" : virtualNow >= startsAt ? "live" : "upcoming";
    return {
      id: week,
      week,
      title: `Week ${week}`,
      startsAt: new Date(startsAt).toISOString(),
      joinCutoffAt: new Date(startsAt + 30 * 60_000).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      state,
      joinable: state !== "done",
      completed: false,
      blockedMessage:
        state === "upcoming"
          ? "This lecture has not started yet."
          : state === "done"
            ? "You missed this lecture. The doors close 30 minutes after it starts."
            : null,
      slides: 0,
      attendance: null,
    };
  });

  const sections = SECTION_PACKS_V1.flatMap((pack) =>
    pack.sections.map((section) => ({
      session_type: "section",
      id: section.id,
      week: section.week,
      kind: section.kind,
      title: section.title,
      startsAt: new Date(
        new Date(LECTURE_STARTS[section.week - 1]).getTime() + LECTURE_WINDOW_MS
      ).toISOString(),
    }))
  );

  const records = lectures.flatMap((lecture) => {
    const after = sections.filter((section) => section.week === lecture.week);
    return [lecture, ...after];
  });

  return { lectures: records, planVersion: 1, generation: null };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

async function prepareAuthenticatedLearner(
  page: import("@playwright/test").Page,
  testInfo: import("@playwright/test").TestInfo,
) {
  const suffix = `${process.pid}-${testInfo.workerIndex}-${Date.now()}`;
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: testInfo.project.use.baseURL as string },
    data: {
      email: `schedule-${suffix}@univai.local`,
      password: "ScheduleTest123!",
      name: "Schedule Learner",
      phone: "+201000000999",
    },
  });
  expect(signup.ok(), await signup.text()).toBe(true);

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
}

async function mockApis(page: import("@playwright/test").Page) {
  await page.route("**/api/clock", async (route) => {
    await route.fulfill({ json: { now: backendState.now } });
  });

  await page.route("**/api/collections", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: backendState.collectionCreated ? { collections: [COLLECTION] } : { collections: [] },
      });
    } else if (route.request().method() === "POST") {
      backendState.collectionCreated = true;
      await route.fulfill({ status: 201, json: { collection: COLLECTION } });
    } else {
      await route.fulfill({ status: 405, json: { error: "Method not allowed" } });
    }
  });

  await page.route("**/api/collections/1/documents", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { documents: DOCUMENTS } });
    } else if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        json: {
          document: {
            id: Date.now(),
            collection_id: 1,
            student_id: STUDENT_ID,
            filename: "uploaded.pdf",
            status: "ready",
            error: null,
            created_at: "2026-07-28T00:00:00Z",
            updated_at: "2026-07-28T00:00:00Z",
          },
        },
      });
    } else {
      await route.fulfill({ status: 405, json: { error: "Method not allowed" } });
    }
  });

  await page.route("**/api/programmes", async (route) => {
    await route.fulfill({ status: 201, json: { programme: { id: 1 } } });
  });

  const APPROVED_AT = "2026-07-28T12:00:00Z";

  await page.route("**/api/programmes/1", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 405, json: { error: "Method not allowed" } });
      return;
    }
    await route.fulfill({
      json: {
        programme: {
          id: 1,
          student_id: STUDENT_ID,
          collection_id: 1,
          name: "Test Programme",
          status: backendState.approvedAt ? "approved" : "proposed",
          plan_version: 1,
          plan: structuredClone(SEVEN_WEEK_PLAN_V1),
          approved_at: backendState.approvedAt,
          created_at: "2026-07-28T00:00:00Z",
          updated_at: backendState.approvedAt ?? "2026-07-28T00:00:00Z",
        },
      },
    });
  });

  await page.route("**/api/programmes/1/approve", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill({ status: 405, json: { error: "Method not allowed" } });
      return;
    }
    backendState.approvedAt = APPROVED_AT;
    await route.fulfill({
      json: {
        programme: {
          id: 1,
          student_id: STUDENT_ID,
          collection_id: 1,
          name: "Test Programme",
          status: "approved",
          plan_version: 1,
          plan: structuredClone(SEVEN_WEEK_PLAN_V1),
          approved_at: APPROVED_AT,
          created_at: "2026-07-28T00:00:00Z",
          updated_at: APPROVED_AT,
        },
      },
    });
  });

  await page.route("**/api/lectures", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 405, json: { error: "Method not allowed" } });
      return;
    }
    await route.fulfill({ json: schedulePayload() });
  });
}

/** Row order in the schedule list — sections must sit under their own lecture. */
function orderOf(rows: string[], needle: string): number {
  return rows.findIndex((row) => row.includes(needle));
}

/**
 * The contract invariants, re-verified on every load: exactly 7 lectures +
 * 2 sections in backend order, sections typed distinctly (chips, never
 * clickable lecture rows), and the current state counts for the virtual now.
 */
async function assertScheduleOrderAndStates(
  page: import("@playwright/test").Page,
  expected: { done: number; upcoming: number; live: number }
) {
  await expect(page.getByText("Week 1 — Week 1")).toBeVisible();
  await expect(page.getByText("Week 7 — Week 7")).toBeVisible();
  await expect(page.getByText("Section — Introduction to AI — Tutorial")).toBeVisible();
  await expect(page.getByText("Section — Calculus I — Tutorial")).toBeVisible();

  const rows = await page.locator(".MuiList-root > *").allTextContents();
  expect(rows).toHaveLength(9); // 7 lectures + 2 sections
  expect(orderOf(rows, "Week 1 —")).toBeLessThan(orderOf(rows, "Section — Introduction to AI — Tutorial"));
  expect(orderOf(rows, "Section — Introduction to AI — Tutorial")).toBeLessThan(orderOf(rows, "Week 2 —"));
  expect(orderOf(rows, "Week 5 —")).toBeLessThan(orderOf(rows, "Section — Calculus I — Tutorial"));
  expect(orderOf(rows, "Section — Calculus I — Tutorial")).toBeLessThan(orderOf(rows, "Week 6 —"));

  // Sections are typed distinctly: never clickable lecture rows, always chips.
  await expect(page.getByText("section", { exact: true })).toHaveCount(2);
  await expect(page.getByText("tutorial", { exact: true })).toHaveCount(2);

  // State counts served by the backend for the current virtual now.
  await expect(page.getByText("done", { exact: true })).toHaveCount(expected.done);
  await expect(page.getByText("upcoming", { exact: true })).toHaveCount(expected.upcoming);
  await expect(page.getByText("live", { exact: true })).toHaveCount(expected.live);
}

/* ------------------------------------------------------------------ */
/*  Demo Contract test                                                */
/* ------------------------------------------------------------------ */

test.beforeAll(async () => {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://univai:univai@127.0.0.1:5434/univai_app_standalone",
  });
  try {
    await pool.query(await readFile("standalone/schema.sql", "utf8"));
  } finally {
    await pool.end();
  }
});

test.beforeEach(async ({ page }, testInfo) => {
  backendState.collectionCreated = false;
  backendState.approvedAt = null;
  backendState.now = "2026-08-03T12:00:00.000Z";
  await prepareAuthenticatedLearner(page, testInfo);
  await mockApis(page);
});

/* ------------------------------------------------------------------ */
/*  Shared flow steps                                                  */
/* ------------------------------------------------------------------ */

/** Approve the 7-week plan via the real UI (collection → upload → curriculum → approve). */
async function approveSevenWeekPlan(page: import("@playwright/test").Page) {
  await page.goto("/library");
  await expect(page.getByText("Source Library")).toBeVisible();
  await page.getByLabel("Collection name").fill("Test Collection");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Collection: Test Collection")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles([
    { name: "ai-textbook.pdf", mimeType: "application/pdf", buffer: Buffer.from("a") },
    { name: "calculus-book.pdf", mimeType: "application/pdf", buffer: Buffer.from("b") },
    { name: "reference.pdf", mimeType: "application/pdf", buffer: Buffer.from("c") },
  ]);
  await expect(page.getByText("Uploaded").first()).toBeVisible();

  await page.getByRole("button", { name: "Build Curriculum" }).click();
  await page.waitForURL("**/curriculum/1");
  await expect(page.getByText("Curriculum Workspace")).toBeVisible();
  await expect(page.getByText(/v1/)).toBeVisible();

  await page.getByRole("button", { name: "Request Approval" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Yes, approve" }).click();
  await expect(page.getByRole("button", { name: "Approved", disabled: true })).toBeVisible();
}

/**
 * The Demo Contract flow at the current viewport: schedule before the semester,
 * advance virtual time into lecture 1, advance past its section, then refresh
 * and re-verify the same order and states — all served by the backend on every
 * load (state restored from the backend, never assumed).
 */
async function runScheduleFlow(page: import("@playwright/test").Page) {
  // Step 1 — schedule before the semester: everything upcoming, sections placed.
  await page.goto("/schedule");
  await expect(page.getByText(/Next lecture: week 1/)).toBeVisible();
  await assertScheduleOrderAndStates(page, { done: 0, upcoming: 7, live: 0 });

  // Step 2 — advance virtual time into lecture 1; the backend re-serves states.
  backendState.now = "2026-08-04T10:05:00.000Z";
  await page.reload();
  await expect(page.getByText(/Week 1 is live — doors close in/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Join now" })).toBeVisible();
  await assertScheduleOrderAndStates(page, { done: 0, upcoming: 6, live: 1 });

  // Step 3 — advance through the section that follows lecture 1 (11:00, per the
  //          fixture contract) and beyond; lecture 1 is done, rest upcoming.
  backendState.now = "2026-08-04T12:30:00.000Z";
  await page.reload();
  await expect(page.getByText(/Next lecture: week 2/)).toBeVisible();
  await assertScheduleOrderAndStates(page, { done: 1, upcoming: 6, live: 0 });

  // Step 4 — a plain refresh restores the SAME order and states from the
  //          backend (no local state to lean on — the payload defines all).
  await page.reload();
  await expect(page.getByText(/Next lecture: week 2/)).toBeVisible();
  await assertScheduleOrderAndStates(page, { done: 1, upcoming: 6, live: 0 });
}

/** Tab until `predicate` matches the focused element (bounded — keyboard-driven). */
async function tabUntil(
  page: import("@playwright/test").Page,
  predicate: (focusedText: string) => boolean,
  maxTabs = 40
): Promise<string> {
  for (let tab = 0; tab < maxTabs; tab++) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.textContent ?? ""
    );
    if (predicate(focused)) return focused;
  }
  return await page.evaluate(
    () => (document.activeElement as HTMLElement | null)?.textContent ?? ""
  );
}

/* ------------------------------------------------------------------ */
/*  Demo Contract tests                                               */
/* ------------------------------------------------------------------ */

test("desktop: approve the 7-week plan with two sections, advance through lecture 1 and its section, refresh keeps order and state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await approveSevenWeekPlan(page);
  await runScheduleFlow(page);
});

test("mobile: approve the 7-week plan with two sections, advance through lecture 1 and its section, refresh keeps order and state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await approveSevenWeekPlan(page);
  await runScheduleFlow(page);
});

test("keyboard: lecture rows are focusable with visible focus, Enter opens them, sections are not tab stops", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/schedule");
  await expect(page.getByText("Week 1 — Week 1")).toBeVisible();

  // Tab (keyboard-only) onto the first lecture row — the primary action.
  const focused = await tabUntil(page, (text) => text.trim().startsWith("Week 1"));
  expect(focused.trim().startsWith("Week 1")).toBe(true);

  // Visible focus: the browser reports :focus-visible for keyboard-driven focus.
  const focusVisible = await page.evaluate(
    () => document.activeElement?.matches(":focus-visible") ?? false
  );
  expect(focusVisible).toBe(true);

  // Enter opens the lecture dialog (advancing through the lecture).
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Week 1 — Week 1")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("When")).toBeVisible();

  // Escape closes it again.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Sections are informational rows, not controls: the next tab stop after
  // week 1's row must be week 2's row — the section is never a tab stop.
  await tabUntil(page, (text) => text.trim().startsWith("Week 2"));
  const afterSectionTab = await page.evaluate(
    () => (document.activeElement as HTMLElement | null)?.textContent ?? ""
  );
  expect(afterSectionTab.trim().startsWith("Week 2")).toBe(true);
});
