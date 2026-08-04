import { test, expect, type Page } from "@playwright/test";

/* ------------------------------------------------------------------ */
/*  Test identity & baseline programme plan                           */
/* ------------------------------------------------------------------ */

const STUDENT_ID = "S-2026-000999";
const SESSION_COOKIE = "better-auth.session_token";
const COLLECTION = { id: 1, student_id: STUDENT_ID, name: "Test Collection", created_at: "2026-07-28T00:00:00Z" };

const BASE_PLAN = {
  semesters: [
    { id: "sem-1", name: "Semester 1", order: 1, course_ids: ["c-1", "c-2"] },
  ],
  courses: [
    { id: "c-1", title: "Introduction to AI", credits: 4, lecture_hours: 30, tutorial_hours: 10, lab_hours: 0, description: "Fundamentals of artificial intelligence." },
    { id: "c-2", title: "Calculus I", credits: 3, lecture_hours: 20, tutorial_hours: 10, lab_hours: 0, description: "Single-variable calculus." },
  ],
  prerequisites: [],
  workload: { total_credits: 7, total_lecture_hours: 50, total_tutorial_hours: 20, total_lab_hours: 0, weeks_per_semester: 14 },
  source_coverage: [
    { document_id: 1, filename: "ai-textbook.pdf", course_ids: ["c-1"], pages: "1–350" },
    { document_id: 2, filename: "calculus-book.pdf", course_ids: ["c-2"], pages: "1–280" },
    { document_id: 3, filename: "reference.pdf", course_ids: ["c-1", "c-2"], pages: "1–120" },
  ],
};

/* ------------------------------------------------------------------ */
/*  Mutable state shared across route interceptors and tests          */
/* ------------------------------------------------------------------ */

const apiState = {
  collectionCreated: false,
  programmeVersion: 1,
  retried: false,
  programmePlan: structuredClone(BASE_PLAN),
  approvedAt: null as string | null,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

async function setSession(page: Page) {
  await page.context().addCookies([
    { name: SESSION_COOKIE, value: "mock-session-token", domain: "localhost", path: "/" },
  ]);
}

async function mockApis(page: Page) {
  await page.route("**/api/clock", async (route) => {
    await route.fulfill({ json: { now: "2026-07-28T12:00:00.000Z" } });
  });

  await page.route("**/api/collections", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: apiState.collectionCreated
          ? { collections: [COLLECTION] }
          : { collections: [] },
      });
    } else if (route.request().method() === "POST") {
      apiState.collectionCreated = true;
      await route.fulfill({ status: 201, json: { collection: COLLECTION } });
    } else {
      await route.fulfill({ status: 405, json: { error: "Method not allowed" } });
    }
  });

  await page.route("**/api/collections/1/documents", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: {
          documents: [
            { id: 1, collection_id: 1, student_id: STUDENT_ID, filename: "ai-textbook.pdf", status: "ready", error: null, created_at: "2026-07-28T00:00:00Z", updated_at: "2026-07-28T00:00:00Z" },
            { id: 2, collection_id: 1, student_id: STUDENT_ID, filename: "calculus-book.pdf", status: "ready", error: null, created_at: "2026-07-28T00:00:00Z", updated_at: "2026-07-28T00:00:00Z" },
            { id: 3, collection_id: 1, student_id: STUDENT_ID, filename: "reference.pdf", status: "ready", error: null, created_at: "2026-07-28T00:00:00Z", updated_at: "2026-07-28T00:00:00Z" },
          ],
        },
      });
    } else if (route.request().method() === "POST") {
      const raw = (await route.request().postDataBuffer()) || Buffer.from("");
      const body = raw.toString("latin1");
      const isRetry = apiState.retried;
      const isCalculusBook = body.includes("calculus-book.pdf");

      if (isCalculusBook && !isRetry) {
        await route.fulfill({ status: 400, json: { error: "File too large." } });
      } else {
        await route.fulfill({
          status: 201,
          json: {
            document: {
              id: Date.now(),
              collection_id: 1, student_id: STUDENT_ID,
              filename: "uploaded.pdf",
              status: "ready", error: null,
              created_at: "2026-07-28T00:00:00Z",
              updated_at: "2026-07-28T00:00:00Z",
            },
          },
        });
      }
    } else {
      await route.fulfill({ status: 405, json: { error: "Method not allowed" } });
    }
  });

  await page.route("**/api/programmes", async (route) => {
    await route.fulfill({ status: 201, json: { programme: { id: 1 } } });
  });

  const APPROVED_AT = "2026-07-28T12:00:00Z";

  await page.route("**/api/programmes/1", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        json: {
          programme: {
            id: 1, student_id: STUDENT_ID, collection_id: 1,
            name: "Test Programme",
            status: apiState.approvedAt ? "approved" : "proposed",
            plan_version: apiState.programmeVersion,
            plan: apiState.programmePlan,
            approved_at: apiState.approvedAt,
            created_at: "2026-07-28T00:00:00Z",
            updated_at: "2026-07-28T00:00:00Z",
          },
        },
      });
    } else if (method === "PATCH") {
      const body = JSON.parse((await route.request().postData()) || "{}");
      if (body.expectedVersion !== apiState.programmeVersion) {
        await route.fulfill({
          status: 409,
          json: { error: "Stale plan version.", current: null },
        });
        return;
      }
      if (body.operation === "rename") {
        apiState.programmePlan = {
          ...apiState.programmePlan,
          courses: apiState.programmePlan.courses.map((course) =>
            course.id === body.courseId
              ? { ...course, title: body.newTitle }
              : course,
          ),
        };
      }
      apiState.programmeVersion++;
      await route.fulfill({
        json: {
          programme: {
            id: 1, student_id: STUDENT_ID, collection_id: 1,
            name: "Test Programme", status: "proposed",
            plan_version: apiState.programmeVersion,
            plan: apiState.programmePlan,
            approved_at: null,
            created_at: "2026-07-28T00:00:00Z",
            updated_at: "2026-07-28T00:00:00Z",
          },
        },
      });
    } else {
      await route.fulfill({ status: 405, json: { error: "Method not allowed" } });
    }
  });

  await page.route("**/api/programmes/1/approve", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill({ status: 405, json: { error: "Method not allowed" } });
      return;
    }
    apiState.approvedAt = APPROVED_AT;
    await route.fulfill({
      json: {
        programme: {
          id: 1, student_id: STUDENT_ID, collection_id: 1,
          name: "Test Programme", status: "approved",
          plan_version: apiState.programmeVersion,
          plan: apiState.programmePlan,
          approved_at: apiState.approvedAt,
          created_at: "2026-07-28T00:00:00Z",
          updated_at: "2026-07-28T12:00:00Z",
        },
      },
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

test.describe("Demo Contract — multi-book curriculum e2e", () => {
  test.beforeEach(async ({ page }) => {
    apiState.collectionCreated = false;
    apiState.programmeVersion = 1;
    apiState.retried = false;
    apiState.approvedAt = null;
    apiState.programmePlan = structuredClone(BASE_PLAN);
    await setSession(page);
    await mockApis(page);
  });

  test("full flow at desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Step 1 — Library page, create collection
    await page.goto("/library");
    await expect(page.getByText("Source Library")).toBeVisible();

    const nameInput = page.getByLabel("Collection name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Test Collection");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("Collection: Test Collection")).toBeVisible();

    // Step 2 — Upload three books. The calculus-book.pdf upload is
    //          rejected by the mock (name-matched in postData).
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      { name: "ai-textbook.pdf", mimeType: "application/pdf", buffer: Buffer.from("a") },
      { name: "calculus-book.pdf", mimeType: "application/pdf", buffer: Buffer.from("b") },
      { name: "reference.pdf", mimeType: "application/pdf", buffer: Buffer.from("c") },
    ]);

    await expect(page.getByText("ai-textbook.pdf").first()).toBeVisible();
    await expect(page.getByText("calculus-book.pdf").first()).toBeVisible();
    await expect(page.getByText("reference.pdf").first()).toBeVisible();

    await expect(page.getByText("Uploaded").first()).toBeVisible();
    await expect(page.getByText("Failed").first()).toBeVisible();
    await expect(page.getByText("File too large.")).toBeVisible();

    // Step 3 — Retry the failed upload
    apiState.retried = true;
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("Failed")).toHaveCount(0, { timeout: 5_000 });

    // Step 4 — Build Curriculum → inspect proposed programme
    await page.getByRole("button", { name: "Build Curriculum" }).click();
    await page.waitForURL("**/curriculum/1");
    await expect(page.getByText("Curriculum Workspace")).toBeVisible();
    await expect(page.getByText("Test Programme")).toBeVisible();
    await expect(page.getByText(/v1/)).toBeVisible();
    await expect(page.getByText("Introduction to AI").first()).toBeVisible();
    await expect(page.getByText("Calculus I").first()).toBeVisible();
    await expect(page.getByText("Request Approval")).toBeVisible();

    // Step 5 — Edit a course (rename) via PUT
    await page.getByRole("button", { name: /Rename Introduction to AI/ }).click();
    const renameDialog = page.getByRole("dialog");
    await expect(renameDialog).toBeVisible();
    const titleField = renameDialog.getByLabel("New title");
    await titleField.clear();
    await titleField.fill("Advanced AI");
    await renameDialog.getByRole("button", { name: "Rename" }).click();
    await expect(page.getByText("Advanced AI").first()).toBeVisible();
    await expect(page.getByText(/v2/)).toBeVisible();

    // Step 6 — Approve the new version
    await page.getByRole("button", { name: "Request Approval" }).click();
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText("Approve this curriculum?")).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Yes, approve" }).click();

    const approvedBtn = page.getByRole("button", { name: "Approved", disabled: true });
    const approvedAlert = page.getByRole("alert").filter({ hasText: "Approved" });
    await expect(approvedBtn).toBeVisible();
    await expect(approvedAlert).toBeVisible();

    // Step 7 — Page refresh restores state from API (not local-only)
    await page.reload();
    await page.waitForURL("**/curriculum/1");
    await expect(page.getByText("Curriculum Workspace")).toBeVisible();
    await expect(page.getByText("Advanced AI").first()).toBeVisible();
    await expect(page.getByText("Approved").first()).toBeVisible();
  });

  test("full flow at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto("/library");
    await expect(page.getByText("Source Library")).toBeVisible();

    const nameInput = page.getByLabel("Collection name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Test Collection");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("Collection: Test Collection")).toBeVisible();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      { name: "ai-textbook.pdf", mimeType: "application/pdf", buffer: Buffer.from("a") },
      { name: "calculus-book.pdf", mimeType: "application/pdf", buffer: Buffer.from("b") },
    ]);

    await expect(page.getByText("ai-textbook.pdf").first()).toBeVisible();
    await expect(page.getByText("calculus-book.pdf").first()).toBeVisible();
    await expect(page.getByText("Uploaded").first()).toBeVisible();
    await expect(page.getByText("Failed").first()).toBeVisible();

    apiState.retried = true;
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("Failed")).toHaveCount(0, { timeout: 5_000 });

    await page.getByRole("button", { name: "Build Curriculum" }).click();
    await page.waitForURL("**/curriculum/1");
    await expect(page.getByText("Curriculum Workspace")).toBeVisible();
    await expect(page.getByText("Request Approval")).toBeVisible();

    await page.getByRole("button", { name: "Request Approval" }).click();
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Yes, approve" }).click();

    const approvedBtn = page.getByRole("button", { name: "Approved", disabled: true });
    await expect(approvedBtn).toBeVisible();
  });
});
