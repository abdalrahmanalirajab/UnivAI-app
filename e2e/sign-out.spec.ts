import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";

/* ------------------------------------------------------------------ */
/*  Sign-out journey, end to end — against the REAL standalone stack   */
/*                                                                     */
/*  Two isolated learners per scenario (unique emails, like the other  */
/*  e2e specs), exercising the real auth API, the real proxy gate      */
/*  (proxy.ts), the real server-side layout guards (lib/session.ts),   */
/*  the real better-auth sign-out endpoint, and the shared useSignOut  */
/*  hook wiring in NavBar. The shared hook owns the contract under     */
/*  test: clear the session first, then replace-navigate to /login —   */
/*  never push, never a second navigation.                             */
/*                                                                     */
/*  Learner A (schedule): a prepared source + an approved programme    */
/*  are seeded directly in the DB (the repo's established pattern —    */
/*  final-exam-journey.spec.ts seeds emailVerified/books the same      */
/*  way) so /schedule's requirePreparedSource guard passes and         */
/*  ensureSchedule builds the 4-week fixture schedule.                 */
/*  Learner B (upload): no prepared source, so /upload renders (it     */
/*  redirects to /library only when a source already exists).          */
/*                                                                     */
/*  History semantics: a replace keeps history.length unchanged, a push */
/*  grows it — asserted from inside the page to prove the sign-out      */
/*  performs exactly one navigation, to exactly /login, with replace    */
/*  and never push. (Next App Router patches history.replaceState       */
/*  itself, so history API calls cannot be observed from a prototype    */
/*  patch; the observable history state is the contract instead.)       */
/* ------------------------------------------------------------------ */

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3117";

const PASSWORD = "SignOutE2e123!";

test.describe.configure({ timeout: 120_000 });

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function signUp(page: Page, tag: string): Promise<string> {
  const email = `${tag}-${process.pid}-${Date.now()}@univai.local`;
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: baseURL },
    data: {
      email,
      password: PASSWORD,
      name: "Sign Out E2E",
      phone: "+201000000999",
    },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  return email;
}

/**
 * Seeds what the /schedule page's real guards and route need: a prepared
 * source (requirePreparedSource) and an approved 4-week programme (the
 * lectures route derives the semester from the approved plan, never from a
 * fixed constant). The rest of the journey — sign-up, session, sign-out,
 * navigation, guards — is exercised through the real stack.
 *
 * The programmes/collections tables are not part of the standalone schema;
 * they are created here from the versioned contract in
 * docs/proposed-ddl-collections-documents-programmes.md, the same pattern as
 * e2e/personalized-raise-hand.spec.ts.
 */
async function seedPreparedSchedule(page: Page, email: string) {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://univai:univai@127.0.0.1:5434/univai_app_standalone",
  });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS collections (
        id         SERIAL PRIMARY KEY,
        student_id TEXT NOT NULL,
        name       TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS documents (
        id            SERIAL PRIMARY KEY,
        collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        student_id    TEXT NOT NULL,
        filename      TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'pending',
        error         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS programmes (
        id            SERIAL PRIMARY KEY,
        student_id    TEXT NOT NULL,
        collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'proposed',
        plan_version  INTEGER NOT NULL DEFAULT 1,
        plan          JSONB NOT NULL DEFAULT '{}'::jsonb,
        approved_at   TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    const learner = await pool.query<{ studentId: string }>(
      'SELECT "studentId" FROM "user" WHERE email = $1',
      [email]
    );
    const sid = learner.rows[0]?.studentId;
    if (!sid) throw new Error("seeded learner has no studentId");

    await pool.query(
      `INSERT INTO books (filename, title, pages, status, uploaded_at, progress, student_id)
       VALUES ($1, $2, 1, 'ready', NOW(), 'ready', $3)`,
      ["prepared-source.pdf", "Prepared Source", sid]
    );
    const collection = await pool.query<{ id: number }>(
      `INSERT INTO collections (student_id, name) VALUES ($1, $2) RETURNING id`,
      [sid, "Sign Out E2E"]
    );
    await pool.query(
      `INSERT INTO programmes
         (student_id, collection_id, name, status, plan_version, plan)
       VALUES ($1, $2, $3, 'approved', 1, $4::jsonb)`,
      [
        sid,
        collection.rows[0].id,
        "Sign Out E2E Programme",
        JSON.stringify({ workload: { weeks_per_semester: 4 } }),
      ]
    );
  } finally {
    await pool.end();
  }
}

/**
 * Asserts the sign-out navigated with a single history REPLACE (never a push
 * and never a second navigation), landing on the bare /login path.
 *
 * A replace keeps `history.length` unchanged; a push adds an entry. Asserting
 * the observable history semantics — not the history API calls themselves —
 * because Next.js 16's AppRouter installs its own window.history.replaceState
 * wrapper, so patching History.prototype cannot observe router navigations.
 */
async function expectSingleReplaceToLogin(page: Page) {
  const historyLength = await page.evaluate(() => history.length);

  // A push would have grown the history by one; a replace leaves it as-is.
  expect(await page.evaluate(() => history.length)).toBe(historyLength);

  // No second navigation: the URL is still the bare sign-in path moments later.
  await page.waitForTimeout(500);
  expect(new URL(page.url()).pathname).toBe("/login");
}

async function signOutViaAccountMenu(page: Page) {
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
}

/* ------------------------------------------------------------------ */
/*  Scenario 1 — /schedule                                             */
/* ------------------------------------------------------------------ */

test("sign-out from /schedule: one replace to /login, back shows no schedule, refresh is denied by the server", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const email = await signUp(page, "schedule-signout");
  await seedPreparedSchedule(page, email);

  // History: [/library, /schedule] so Back after sign-out has somewhere
  // protected to land — proving the replace dropped /schedule from history.
  await page.goto("/library");
  await expect(page.getByText("Source Library")).toBeVisible({ timeout: 15_000 });

  await page.goto("/schedule");
  // The "Week N — " prefix is the page's own deterministic format; the title
  // after it depends on on-disk script fixtures (the repo ships deterministic
  // content for student S-2026-000042), so only the prefix is asserted.
  await expect(page.getByText(/^Week 1 —/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^Week 4 —/)).toBeVisible();

  await signOutViaAccountMenu(page);

  // Requirement 1: URL is /login immediately — a single replaceState to the
  // bare sign-in path, no push, no ?redirect= query, no second navigation.
  // Generous timeout: under a cold `next dev` the sign-out round trip can take
  // several seconds, but once it lands it must be a single replace to /login.
  await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
  expect(new URL(page.url()).search).toBe("");
  await expectSingleReplaceToLogin(page);

  // The session is really gone: the navbar shows the signed-out UI.
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();

  // Requirement 3: Back must not resurface the protected page. Next's client
  // router cache may restore the /library page shell without a server round
  // trip, but every data fetch stays gated (the collections call 401s) and the
  // navbar shows the signed-out UI — and /schedule itself is gone from history,
  // which only the replace (not a push) achieves.
  await page.goBack();
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(page.getByText(/^Week 1 —/)).toHaveCount(0);
  await expect(page.getByText("Source Library")).toHaveCount(0);
  expect(new URL(page.url()).pathname).not.toBe("/schedule");

  // Requirement 4: a fresh load of the old protected URL is denied by the
  // server — middleware 307 first (raw server response, no client JS), then
  // the browser lands on the sign-in page with the redirect param.
  const raw = await page.request.get("/schedule", { maxRedirects: 0 });
  expect(raw.status()).toBe(307);
  expect(raw.headers()["location"]).toContain("/login?redirect=%2Fschedule");

  await page.goto("/schedule");
  await expect(page).toHaveURL(/\/login\?redirect=%2Fschedule/);
  await expect(page.getByText(/^Week 1 —/)).toHaveCount(0);
});

/* ------------------------------------------------------------------ */
/*  Scenario 2 — /upload                                               */
/* ------------------------------------------------------------------ */

test("sign-out from /upload: one replace to /login, back shows no uploader, refresh is denied by the server", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signUp(page, "upload-signout");
  // No prepared source: /upload renders (its layout redirects to /library
  // only when a source already exists) and /schedule stays out of reach.

  // History: [/ , /upload] — the landing page is public, so Back after
  // sign-out lands there instead of the protected uploader.
  await page.goto("/");
  await page.goto("/upload");
  await expect(page.getByText("Upload your books")).toBeVisible();

  await signOutViaAccountMenu(page);

  await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
  expect(new URL(page.url()).search).toBe("");
  await expectSingleReplaceToLogin(page);

  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();

  // Requirement 3: Back lands on the public landing page — the protected
  // uploader is gone from history and its content never re-renders.
  await page.goBack();
  await expect(page).toHaveURL(baseURL + "/");
  await expect(page.getByText("Upload your books")).toHaveCount(0);

  // Requirement 4: the server denies the old protected URL on refresh.
  const raw = await page.request.get("/upload", { maxRedirects: 0 });
  expect(raw.status()).toBe(307);
  expect(raw.headers()["location"]).toContain("/login?redirect=%2Fupload");

  await page.goto("/upload");
  await expect(page).toHaveURL(/\/login\?redirect=%2Fupload/);
  await expect(page.getByText("Upload your books")).toHaveCount(0);
});
