import { test, expect, type Page } from "@playwright/test";

/* ------------------------------------------------------------------ */
/*  Demo script from the issue, end to end against the real /library  */
/*  UI:                                                                */
/*                                                                     */
/*   1. Upload three books                                             */
/*   2. Force exactly one to fail (request interception, name-matched) */
/*   3. Refresh the page                                               */
/*   4. Retry only the failed one                                      */
/*   5. Remove one unapproved/unreferenced source                      */
/*   6. Assert the other sources remain intact and usable              */
/*                                                                     */
/*  The network layer is intercepted with contract-shaped responses    */
/*  (the same pattern as test/demo-contract.e2e.ts); every page        */
/*  component and its real logic runs. The forced failure is produced  */
/*  by interception — never by a flaky external condition.             */
/* ------------------------------------------------------------------ */

const STUDENT_ID = "S-2026-000999";

const COLLECTION = {
  id: 1,
  student_id: STUDENT_ID,
  name: "Test Collection",
  created_at: "2026-07-28T00:00:00Z",
};

type Doc = {
  id: number;
  collection_id: number;
  student_id: string;
  filename: string;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------------------ */
/*  Backend state the interceptors serve (contract-shaped)             */
/* ------------------------------------------------------------------ */

const apiState = {
  collectionCreated: false,
  // The approved plan's source coverage: documents 1 (a.pdf) and
  // 3 (c.pdf) are referenced, so they are NOT removable. The retried
  // b.pdf (document 2) is outside it — the one unapproved/unreferenced
  // source the script removes.
  approvedCoverage: new Set([1, 3]),
  docs: [] as Doc[],
  // Per-filename upload request counts, as observed by the backend —
  // proves "retry ONLY the failed one" at the network level.
  uploadsByFile: {} as Record<string, number>,
  // b.pdf uploads fail until the retry phase explicitly allows them.
  allowRetry: false,
  nextDocId: 1,
};

/* ------------------------------------------------------------------ */
/*  Route interceptors                                                 */
/* ------------------------------------------------------------------ */

async function mockApis(page: Page) {
  await page.route("**/api/clock", async (route) => {
    await route.fulfill({ json: { now: "2026-07-28T12:00:00.000Z" } });
  });

  await page.route("**/api/collections", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        json: apiState.collectionCreated ? { collections: [COLLECTION] } : { collections: [] },
      });
    } else if (method === "POST") {
      apiState.collectionCreated = true;
      await route.fulfill({ status: 201, json: { collection: COLLECTION } });
    } else {
      await route.fulfill({ status: 405, json: { error: "Method not allowed" } });
    }
  });

  await page.route("**/api/upload", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill({ status: 405, json: { error: "Method not allowed" } });
      return;
    }
    const body = (await route.request().postDataBuffer()).toString("latin1");
    const persistedRetry = apiState.docs.find(
      (doc) =>
        doc.status === "failed" &&
        body.includes('name="documentId"') &&
        body.includes(String(doc.id)),
    );
    const name =
      persistedRetry?.filename ??
      ["a.pdf", "b.pdf", "c.pdf"].find((candidate) => body.includes(candidate));
    if (!name) {
      await route.fulfill({ status: 400, json: { error: "No file uploaded." } });
      return;
    }
    apiState.uploadsByFile[name] = (apiState.uploadsByFile[name] ?? 0) + 1;
    if (name === "b.pdf" && !apiState.allowRetry) {
      const id = apiState.nextDocId++;
      apiState.docs.push({
        id,
        collection_id: 1,
        student_id: STUDENT_ID,
        filename: name,
        status: "failed",
        error: "Could not prepare this book.",
        created_at: "2026-07-28T12:00:00.000Z",
        updated_at: "2026-07-28T12:00:00.000Z",
      });
      // The one forced failure — same body shape the real route serves.
      await route.fulfill({
        status: 502,
        json: {
          error: "Could not prepare this book.",
          detail: "RAG service rejected the upload (forced failure).",
          documentId: id,
          collectionId: 1,
          bookId: 100 + id,
        },
      });
      return;
    }
    const id = persistedRetry?.id ?? apiState.nextDocId++;
    if (persistedRetry) {
      persistedRetry.status = "ready";
      persistedRetry.error = null;
      persistedRetry.updated_at = "2026-07-28T12:05:00.000Z";
    } else {
      apiState.docs.push({
        id,
        collection_id: 1,
        student_id: STUDENT_ID,
        filename: name,
        status: "ready",
        error: null,
        created_at: "2026-07-28T12:00:00.000Z",
        updated_at: "2026-07-28T12:00:00.000Z",
      });
    }
    // Same body shape the real /api/upload route serves on success.
    await route.fulfill({
      status: 200,
      json: {
        book: {
          id: 100 + id,
          filename: name,
          title: null,
          pages: 4,
          status: "generating",
          error: null,
          progress: "Preparing your four-week course…",
          uploaded_at: "2026-07-28T12:00:00.000Z",
        },
        ragConfigured: true,
        message: "indexed",
      },
    });
  });

  await page.route("**/api/collections/1/documents*", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        json: { documents: [...apiState.docs].sort((a, b) => a.id - b.id) },
      });
      return;
    }
    if (method === "DELETE") {
      const id = Number(new URL(route.request().url()).searchParams.get("documentId"));
      if (apiState.approvedCoverage.has(id)) {
        await route.fulfill({
          status: 409,
          json: {
            error: "This source is part of your approved plan and cannot be removed.",
          },
        });
        return;
      }
      apiState.docs = apiState.docs.filter((d) => d.id !== id);
      await route.fulfill({ status: 200, json: { removed: true } });
      return;
    }
    await route.fulfill({ status: 405, json: { error: "Method not allowed" } });
  });
}

async function prepareAuthenticatedLearner(page: Page) {
  const credentials = {
    email: "multi-book-library-e2e@example.test",
    password: "E2e-library-password-17!",
  };
  const signup = await page.request.post("/api/auth/sign-up/email", {
    data: {
      ...credentials,
      name: "Multi Book E2E",
      phone: "+201000000017",
    },
  });
  if (!signup.ok()) {
    const signin = await page.request.post("/api/auth/sign-in/email", {
      data: credentials,
    });
    expect(signin.ok(), await signin.text()).toBeTruthy();
  }

  // Server layouts check prepared-source state directly in PostgreSQL. Seed
  // one deterministic standalone source before browser API interception.
  const seed = await page.request.post("/api/upload", {
    multipart: {
      file: {
        name: "e2e-access-seed.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\ne2e access seed"),
      },
    },
  });
  expect(seed.ok(), await seed.text()).toBeTruthy();
}

/* ------------------------------------------------------------------ */
/*  Test                                                               */
/* ------------------------------------------------------------------ */

test("multi-book library demo script: three uploads, one forced failure, refresh, retry only the failed one, remove an unreferenced source, the rest stay intact", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepareAuthenticatedLearner(page);
  await mockApis(page);

  const chip = (label: string) => page.locator(".MuiChip-root").filter({ hasText: label });
  const pdf = (name: string) => ({
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from(`%PDF-1.4\n${name}`),
  });

  // Step 1 — create the collection through the real UI.
  await page.goto("/library");
  await expect(page.getByText("Source Library")).toBeVisible();
  const nameInput = page.getByLabel("Collection name");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("Test Collection");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Collection: Test Collection")).toBeVisible();

  // Step 2 — upload three books; b.pdf is forced to fail by interception.
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")]);

  for (const name of ["a.pdf", "b.pdf", "c.pdf"]) {
    await expect(page.getByText(name).first()).toBeVisible();
  }
  await expect(chip("Uploaded")).toHaveCount(2);
  await expect(chip("Failed")).toHaveCount(1);
  await expect(page.getByText("Could not prepare this book.").first()).toBeVisible();

  // All three states are durable: the failed source remains retryable after refresh.
  const sourceRows = page.locator("table tbody tr");
  await expect(sourceRows).toHaveCount(3);
  await expect(sourceRows.getByText("a.pdf")).toBeVisible();
  await expect(sourceRows.getByText("b.pdf")).toBeVisible();
  await expect(sourceRows.getByText("c.pdf")).toBeVisible();

  // Step 3 — refresh: the library is rebuilt from the backend list.
  await page.reload();
  await expect(page.getByText("Source Library")).toBeVisible();
  await expect(page.getByText("Collection: Test Collection")).toBeVisible();
  await expect(sourceRows).toHaveCount(3);
  await expect(chip("ready")).toHaveCount(2);
  await expect(chip("failed")).toHaveCount(1);

  // Step 4 — retry ONLY the persisted failed source; no file re-selection is needed.
  apiState.allowRetry = true;
  await sourceRows.filter({ hasText: "b.pdf" }).getByRole("button", { name: "Retry" }).click();
  await expect(chip("ready")).toHaveCount(3);
  await expect(chip("failed")).toHaveCount(0);
  await expect(sourceRows).toHaveCount(3);
  await expect(sourceRows.getByText("b.pdf")).toBeVisible();

  // The observed network traffic proves nothing but b.pdf was re-submitted.
  expect(apiState.uploadsByFile).toEqual({ "a.pdf": 1, "b.pdf": 2, "c.pdf": 1 });

  // Step 5 — remove the one unapproved/unreferenced source (b.pdf).
  await page.getByRole("button", { name: "Remove source b.pdf" }).click();
  await expect(sourceRows.getByText("b.pdf")).toHaveCount(0);
  await expect(sourceRows).toHaveCount(2);

  // a.pdf IS referenced by the approved plan's coverage — removal is
  // refused, proving the "unapproved/unreferenced" criterion is real.
  await page.getByRole("button", { name: "Remove source a.pdf" }).click();
  await expect(
    page.getByText("This source is part of your approved plan and cannot be removed."),
  ).toBeVisible();
  await expect(sourceRows).toHaveCount(2);
  await expect(sourceRows.getByText("a.pdf")).toBeVisible();

  // Step 6 — the other sources remain intact and usable after a reload.
  await page.reload();
  await expect(page.getByText("Source Library")).toBeVisible();
  await expect(sourceRows).toHaveCount(2);
  await expect(chip("ready")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Remove source a.pdf" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Remove source c.pdf" })).toBeEnabled();
  await expect(page.getByText("Could not load sources")).toHaveCount(0);
  await expect(page.getByText("No connection")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Build Curriculum" })).toBeVisible();
});
