import { test, expect } from "@playwright/test";
import { SEVEN_WEEK_PLAN_V1 } from "../test/fixtures/programme-plans-v1";
import {
  validChainABC,
  cycleFixture,
  staleVersionFixture,
  type LearningPathV1,
} from "../test/fixtures/learning-path-v1";

test.describe.configure({ timeout: 120_000 });

/* ------------------------------------------------------------------ */
/*  Demo Contract — cross-book learning-path approval, end to end      */
/*                                                                     */
/*  Scenario 1 (validChainABC, A -> B -> C): through the real page     */
/*  the contract's edges render with their citations, the evidence     */
/*  dialog is actionable, the matching exact version is never blocked, */
/*  and the human approval completes against the backend.              */
/*                                                                     */
/*  Scenario 2 (cycleFixture): the same real page disables the         */
/*  approve control and shows the specific cycle reason — the approve  */
/*  action is provably blocked (a forced click opens no dialog).       */
/*                                                                     */
/*  The race test additionally proves the exact-version conflict path: */
/*  approving a superseded version is rejected with a 409 carrying the */
/*  newest state, the page rebuilds from `current`, the contract is    */
/*  re-fetched for the fresh version, and the recovery approval        */
/*  succeeds — a superseded version is never silently approved.        */
/*                                                                     */
/*  HARNESS HONESTY — no real Postgres is required to run this spec:   */
/*  the auth proxy gate (proxy.ts) only checks session-cookie          */
/*  presence, so a session cookie is set directly; every API call the  */
/*  page makes (programme GET carrying the versioned contract, approve*/
/*  POST, auth get-session) is intercepted at the network boundary     */
/*  with route-faithful semantics matching the Phase 5 approve route   */
/*  (exact-version 409 with `current`, idempotent 200 naming           */
/*  approvedVersion). The real route code — session-derived            */
/*  authorization, tamper rejection — is exercised by the unit suite   */
/*  (test/cross-book-prerequisite-flow.test.tsx) instead.              */
/*                                                                     */
/*  The programme payload carries the versioned learning-path fixture; */
/*  the contract always matches the version the backend currently holds.*/
/* ------------------------------------------------------------------ */

const STUDENT_ID = "S-2026-000999";

const baseURL = process.env.E2E_BASE_URL?.trim() || "http://localhost:3117";

const backendState = {
  latestVersion: 3,
  approvedAt: null as string | null,
  learningPath: validChainABC as LearningPathV1,
};

function programmePayload(planVersion: number, status: "proposed" | "approved") {
  const approvedAt =
    status === "approved" ? (backendState.approvedAt ?? "2026-07-28T12:00:00Z") : null;
  return {
    id: 1,
    student_id: STUDENT_ID,
    collection_id: 1,
    name: "Test Programme",
    status,
    plan_version: planVersion,
    plan: {
      ...structuredClone(SEVEN_WEEK_PLAN_V1),
      learning_path: structuredClone(backendState.learningPath),
    },
    approved_at: approvedAt,
    created_at: "2026-07-28T00:00:00Z",
    updated_at: approvedAt ?? "2026-07-28T00:00:00Z",
  };
}

/**
 * The proxy gate only checks that a session cookie exists (proxy.ts), so the
 * harness sets one directly instead of doing a real signup round-trip.
 */
async function setSessionCookie(page: import("@playwright/test").Page) {
  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: "e2e-session-token-placeholder",
      url: baseURL,
    },
  ]);
}

async function mockApis(page: import("@playwright/test").Page) {
  await page.route("**/api/programmes/1", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 405, json: { error: "Method not allowed" } });
      return;
    }
    await route.fulfill({
      json: { programme: programmePayload(backendState.latestVersion, "proposed") },
    });
  });

  await page.route("**/api/programmes/1/approve", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill({ status: 405, json: { error: "Method not allowed" } });
      return;
    }
    const body = JSON.parse((await route.request().postData()) ?? "{}") as {
      planVersion?: number;
    };
    if (body.planVersion !== backendState.latestVersion) {
      // Exact-version rule: a superseded version is rejected with the current
      // state so the UI can rebuild from it — never silently approved.
      await route.fulfill({
        status: 409,
        json: {
          error: "Stale plan version. Refresh and try again.",
          current: programmePayload(backendState.latestVersion, "proposed"),
        },
      });
      return;
    }
    backendState.approvedAt = "2026-07-28T12:00:00Z";
    await route.fulfill({
      status: 200,
      json: {
        programme: programmePayload(backendState.latestVersion, "approved"),
        approvedVersion: backendState.latestVersion,
      },
    });
  });

  // The layout's client-side session hook would otherwise hit the real auth
  // endpoint (which needs the database); keep the harness DB-free with an
  // explicit logged-out session.
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({ status: 401, json: { user: null, session: null } });
  });
}

/* ------------------------------------------------------------------ */
/*  Scenario 1 — validChainABC (A -> B -> C): citations shown,         */
/*  approval completes successfully through the real UI.               */
/* ------------------------------------------------------------------ */

test.beforeEach(async ({ page }) => {
  backendState.latestVersion = 3;
  backendState.approvedAt = null;
  backendState.learningPath = validChainABC;
  await setSessionCookie(page);
  await mockApis(page);
});

test("validChainABC: both edges render with their citations and the approval completes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/curriculum/1");
  await expect(page.getByText("Curriculum Workspace")).toBeVisible();

  // A -> B -> C: both prerequisite edges are visible.
  await expect(page.getByText("Finish Linear Algebra before Calculus I")).toBeVisible();
  await expect(page.getByText("Finish Calculus I before Mathematical Methods")).toBeVisible();

  // Citations: both evidence chips are shown and actionable.
  const algebraCitation = page.getByRole("button", {
    name: "Open evidence from Linear Algebra",
  });
  const calculusCitation = page.getByRole("button", {
    name: "Open evidence from Calculus I",
  });
  await expect(algebraCitation).toBeVisible();
  await expect(calculusCitation).toBeVisible();

  await algebraCitation.click();
  const evidenceDialog = page.getByRole("dialog", { name: "Evidence" });
  await expect(evidenceDialog).toBeVisible();
  await expect(evidenceDialog.getByText("Pages: 1–120")).toBeVisible();
  await evidenceDialog.getByRole("button", { name: "Close" }).click();
  await expect(evidenceDialog).not.toBeVisible();

  // Exact version match (v3) → nothing blocks the approve action.
  const approveButton = page.getByRole("button", { name: "Approve" });
  await expect(approveButton).toBeEnabled();

  // The approval is an explicit human action through the confirm dialog.
  await approveButton.click();
  await page.getByRole("dialog").getByRole("button", { name: "Yes, approve" }).click();

  await expect(page.getByRole("button", { name: "Approved", disabled: true })).toBeVisible();
  await expect(
    page.getByText("This programme has been approved and expensive generation has been triggered."),
  ).toBeVisible();
});

test("mobile: the same approval flow fits the small viewport without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/curriculum/1");
  await expect(page.getByText("Curriculum Workspace")).toBeVisible();

  const approveButton = page.getByRole("button", { name: "Approve" });
  await expect(approveButton).toBeEnabled();
  await approveButton.click();
  await page.getByRole("dialog").getByRole("button", { name: "Yes, approve" }).click();
  await expect(page.getByRole("button", { name: "Approved", disabled: true })).toBeVisible();

  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasOverflow).toBe(false);
});

/* ------------------------------------------------------------------ */
/*  Scenario 2 — cycleFixture: the approve action is blocked/disabled  */
/*  with the specific cycle reason shown.                              */
/* ------------------------------------------------------------------ */

test("cycleFixture: the approve action is blocked with the cycle reason shown", async ({
  page,
}) => {
  backendState.latestVersion = 1;
  backendState.learningPath = cycleFixture;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/curriculum/1");
  await expect(page.getByText("Curriculum Workspace")).toBeVisible();

  // The specific cycle reason is visible where blocks are listed…
  await expect(
    page.getByText("Prerequisite cycle detected: Linear Algebra → Calculus I → Linear Algebra."),
  ).toBeVisible();
  // The block is reported both by the page and by the workspace alert.
  await expect(page.getByText("Approval blocked").first()).toBeVisible();

  // …and the approve control is disabled with the page-level explanation.
  const approveButton = page.getByRole("button", { name: "Approve" });
  await expect(approveButton).toBeDisabled();
  await expect(
    page.getByText(
      "The learning path has unresolved issues. Review the specific reasons listed below before requesting approval.",
    ),
  ).toBeVisible();

  // Prove the block is real: even a forced click opens no confirmation dialog.
  await approveButton.click({ force: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

/* ------------------------------------------------------------------ */
/*  Exact-version conflict — a superseded approval is never silently   */
/*  approved; the UI rebuilds from the backend's `current` and the     */
/*  recovery approval on the fresh version succeeds.                   */
/* ------------------------------------------------------------------ */

test("a superseded approval attempt is rejected with the fresh version and recovers on it", async ({
  page,
}) => {
  // The learner's tab holds version 2 while the backend has moved to 3 —
  // the race the exact-version rule exists for.
  backendState.latestVersion = 2;
  backendState.learningPath = staleVersionFixture;
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/curriculum/1");
  await expect(page.getByText("Curriculum Workspace")).toBeVisible();
  await expect(page.getByText(/v2/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled();

  // Backend advances to version 3 after the page fetched version 2; the
  // versioned contract moves with it.
  backendState.latestVersion = 3;
  backendState.learningPath = validChainABC;

  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Yes, approve" }).click();

  // The 409 must surface, never a silent approval: the issue alert names the
  // stale version and the workspace rebuilds from the fetched `current` (v3).
  await expect(page.getByText("Approval issue")).toBeVisible();
  await expect(
    page.getByText("Stale plan version. The latest version is shown below — review and try again."),
  ).toBeVisible();
  // The rebuilt page shows the fresh version (programme chip and contract chip).
  await expect(page.getByText(/v3/).first()).toBeVisible();

  // Recovery on the fresh version: the contract was re-fetched for v3, so the
  // control is enabled again and the approval completes against the backend.
  const approveButton = page.getByRole("button", { name: "Approve" });
  await expect(approveButton).toBeEnabled();
  await approveButton.click();
  await page.getByRole("dialog").getByRole("button", { name: "Yes, approve" }).click();
  await expect(page.getByRole("button", { name: "Approved", disabled: true })).toBeVisible();
});
