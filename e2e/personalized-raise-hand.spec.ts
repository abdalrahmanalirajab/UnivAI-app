import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { TokenVerifier } from "livekit-server-sdk";
import { LECTURES_ROOT } from "@/lib/paths";

/* ------------------------------------------------------------------ */
/*  Personalized live session metadata — real integration gate         */
/*                                                                     */
/*  Demo: Mohamed Hany and Sara Ali join the same lecture. Each signed */
/*  LiveKit token's metadata must contain ONLY that learner's own safe */
/*  spoken name, bound to learner, lecture, plan version and nonce —   */
/*  never the other learner's, and never email/phone. The token route  */
/*  runs for real against the database; only the RAG/planning services */
/*  are mocked by seeding the contract-shaped rows below.              */
/*                                                                     */
/*  The raise-hand journey stays client-name-free: the client never    */
/*  sends a name to Live; it arrives solely through the signed token.  */
/* ------------------------------------------------------------------ */

const DB_URL =
  process.env.DATABASE_URL ??
  "postgresql://univai:univai@127.0.0.1:5434/univai_app_standalone";

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? "";
const LIVEKIT_URL = process.env.LIVEKIT_URL ?? "";

// The programmes/collections tables are not part of the standalone schema.
// They are created here from the versioned contract in
// docs/proposed-ddl-collections-documents-programmes.md so that
// lib/lectures.getLectures / approvedPlanVersion run their real code paths.
const PROGRAMMES_DDL = `
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
`;

const PLAN_V1 = {
  workload: { weeks_per_semester: 1 },
  section_packs: [],
};

let dbReady = false;
let dbReason = "";

test.describe.configure({ timeout: 120_000 });

test.beforeAll(async () => {
  const pool = new Pool({ connectionString: DB_URL });
  try {
    await pool.query(await readFile("standalone/schema.sql", "utf8"));
    await pool.query(PROGRAMMES_DDL);
    // Deterministic: start from real time so the seeded lecture is live but
    // still inside the join window.
    await pool.query("UPDATE clock_state SET offset_ms = 0 WHERE id = 1");
    dbReady = true;
  } catch (error) {
    dbReason = error instanceof Error ? error.message : String(error);
  } finally {
    try {
      await pool.end();
    } catch {
      // The connection may already be closed after a failed connect.
    }
  }
});

test("Mohamed Hany and Sara Ali each get signed metadata with only their own safe spoken name", async ({
  browser,
}, testInfo) => {
  test.skip(!dbReady, `PostgreSQL not reachable (${DB_URL}): ${dbReason}`);
  test.skip(
    !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL,
    "LIVEKIT_API_KEY/API_KEY/API_SECRET not set; the token route returns 503 and cannot mint a real signed token.",
  );
  const verifier = new TokenVerifier(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  const learners = [
    { name: "Mohamed Hany", email: `personalized-mh-${process.pid}-${Date.now()}@univai.local` },
    { name: "Sara Ali", email: `personalized-sa-${process.pid}-${Date.now()}@univai.local` },
  ];
  const sessions: Array<{ sid: string; lectureId: number; token: string }> = [];

  for (const learner of learners) {
    const context = await browser.newContext();
    try {
      const signup = await context.request.post("/api/auth/sign-up/email", {
        headers: { Origin: testInfo.project.use.baseURL as string },
        data: {
          email: learner.email,
          password: "Personalized123!",
          name: learner.name,
          phone: "+201000000999",
        },
      });
      expect(signup.ok(), await signup.text()).toBe(true);

      const sid = await seedLearner(learner.email);
      const lectureId = await seedLecture(sid, learner.name);

      const tokenResponse = await context.request.post(`/api/lecture/${lectureId}/token`, {
        headers: { Origin: testInfo.project.use.baseURL as string },
      });
      expect(tokenResponse.status(), await tokenResponse.text()).toBe(200);
      const { token } = (await tokenResponse.json()) as { token: string };

      const claims = await verifier.verify(token);
      const metadata = JSON.parse(claims.metadata ?? "{}") as Record<string, unknown>;

      expect(claims.sub).toBe(sid);
      expect(claims.name).toBe(learner.name);
      expect(claims).not.toHaveProperty("email");
      expect(claims).not.toHaveProperty("phone");

      expect(metadata).toMatchObject({
        v: 1,
        lectureId,
        week: 1,
        sid,
        planVersion: 1,
        spokenName: learner.name,
      });
      expect(metadata.nonce).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(Object.keys(metadata).sort()).toEqual([
        "lectureId",
        "nonce",
        "planVersion",
        "sid",
        "spokenName",
        "v",
        "week",
      ]);

      const secondsToExpiry = (claims.exp as number) - Math.floor(Date.now() / 1000);
      expect(secondsToExpiry).toBeGreaterThan(580);
      expect(secondsToExpiry).toBeLessThan(605);

      sessions.push({ sid, lectureId, token });
    } finally {
      await context.close();
    }
  }

  expect(sessions[0].sid).not.toBe(sessions[1].sid);
  const [mohamed, sara] = sessions;

  const mohamedClaims = await verifier.verify(mohamed.token);
  const saraClaims = await verifier.verify(sara.token);
  const mohamedMetadata = JSON.parse(mohamedClaims.metadata ?? "{}") as Record<string, string>;
  const saraMetadata = JSON.parse(saraClaims.metadata ?? "{}") as Record<string, string>;

  expect(mohamedMetadata.spokenName).toBe("Mohamed Hany");
  expect(saraMetadata.spokenName).toBe("Sara Ali");
  expect(JSON.stringify(saraMetadata)).not.toContain("Mohamed");
  expect(JSON.stringify(mohamedMetadata)).not.toContain("Sara");
  expect(mohamedMetadata.nonce).not.toBe(saraMetadata.nonce);
});

test("tampered or forged session metadata is rejected by signature verification", async ({
  browser,
}, testInfo) => {
  test.skip(!dbReady, `PostgreSQL not reachable (${DB_URL}): ${dbReason}`);
  test.skip(
    !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL,
    "LIVEKIT_API_KEY/API_KEY/API_SECRET not set; cannot mint a real signed token to tamper.",
  );
  const verifier = new TokenVerifier(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  const context = await browser.newContext();
  try {
    const email = `personalized-tamper-${process.pid}-${Date.now()}@univai.local`;
    const signup = await context.request.post("/api/auth/sign-up/email", {
      headers: { Origin: testInfo.project.use.baseURL as string },
      data: { email, password: "Personalized123!", name: "Mohamed Hany", phone: "+201000000999" },
    });
    expect(signup.ok(), await signup.text()).toBe(true);

    const sid = await seedLearner(email);
    const lectureId = await seedLecture(sid, "Mohamed Hany");
    const tokenResponse = await context.request.post(`/api/lecture/${lectureId}/token`);
    expect(tokenResponse.status(), await tokenResponse.text()).toBe(200);
    const { token } = (await tokenResponse.json()) as { token: string };

    const [header, payload, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      metadata: string;
    };
    // Replace the signed spoken name with another learner's.
    decoded.metadata = decoded.metadata.replace(
      '"spokenName":"Mohamed Hany"',
      '"spokenName":"Sara Ali"',
    );
    const swapped = `${header}.${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${signature}`;
    await expect(verifier.verify(swapped)).rejects.toThrow();

    const corrupted = `${header}.${payload}.${signature.replace(/.$/, signature.endsWith("a") ? "b" : "a")}`;
    await expect(verifier.verify(corrupted)).rejects.toThrow();
  } finally {
    await context.close();
  }
});

test("raise-hand journey works and the client never sends a name to Live", async ({
  browser,
}, testInfo) => {
  test.skip(!dbReady, `PostgreSQL not reachable (${DB_URL}): ${dbReason}`);

  const context = await browser.newContext();
  try {
    const email = `personalized-raise-${process.pid}-${Date.now()}@univai.local`;
    const signup = await context.request.post("/api/auth/sign-up/email", {
      headers: { Origin: testInfo.project.use.baseURL as string },
      data: { email, password: "Personalized123!", name: "Sara Ali", phone: "+201000000999" },
    });
    expect(signup.ok(), await signup.text()).toBe(true);
    const sid = await seedLearner(email);
    const lectureId = await seedLecture(sid, "Sara Ali");

    const page = await context.newPage();
    await page.goto(`/lecture/${lectureId}`);

    // The standalone room is the client side of this journey. The raised hand
    // message the client publishes carries no name — personalization travels
    // only through the signed token minted by the server.
    const raiseHand = page.getByRole("button", { name: "Raise hand" });
    await expect(raiseHand).toBeVisible();
    await raiseHand.focus();
    await raiseHand.press("Enter");
    await expect(page.getByText("Hand raised", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

/* ------------------------------------------------------------------ */
/*  Database helpers                                                   */
/* ------------------------------------------------------------------ */

async function withPool<T>(run: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: DB_URL });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

/** Fetch the learner, verify their email, and prepare a ready book. */
async function seedLearner(email: string): Promise<string> {
  return withPool(async (pool) => {
    const user = await pool.query<{ id: string; studentId: string }>(
      `SELECT "id", "studentId" FROM "user" WHERE "email" = $1`,
      [email],
    );
    expect(user.rows.length).toBe(1);
    const { id, studentId } = user.rows[0];

    await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE "id" = $1`, [id]);
    await pool.query(
      `INSERT INTO books (filename, title, pages, status, uploaded_at, student_id)
       VALUES ($1, $2, 2, 'ready', NOW(), $3)`,
      ["personalized-source.pdf", "Personalized Source", studentId],
    );
    return studentId;
  });
}

/**
 * Seed an approved plan + its schedule binding + a live lecture row so the
 * real getLectures/approvedPlanVersion/stampJoin paths all run server-side.
 */
async function seedLecture(sid: string, title: string): Promise<number> {
  const lectureId = await withPool(async (pool) => {
    const collection = await pool.query<{ id: number }>(
      `INSERT INTO collections (student_id, name) VALUES ($1, $2) RETURNING id`,
      [sid, "Personalized Collection"],
    );
    const collectionId = collection.rows[0].id;

    const programme = await pool.query<{ id: number }>(
      `INSERT INTO programmes
         (student_id, collection_id, name, status, plan_version, plan, approved_at)
       VALUES ($1, $2, 'Personalized Plan', 'approved', 1, $3::jsonb, NOW())
       RETURNING id`,
      [sid, collectionId, JSON.stringify(PLAN_V1)],
    );
    const programmeId = programme.rows[0].id;

    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [`schedule:${sid}:approved-plan`, JSON.stringify({ programmeId, planVersion: 1, weekCount: 1 })],
    );

    const lecture = await pool.query<{ id: number }>(
      `INSERT INTO lectures (week, title, starts_at, status, student_id)
       VALUES (1, $1, $2, 'ready', $3) RETURNING id`,
      [title, new Date(Date.now() - 120_000), sid],
    );
    return lecture.rows[0].id;
  });
  const folder = path.join(LECTURES_ROOT, sid, "week-1");
  await mkdir(folder, { recursive: true });
  await writeFile(
    path.join(folder, "script.json"),
    JSON.stringify({
      lectureId: "course-personalized-1",
      title,
      segments: [{ slide: 1, text: "Grounded personalized lecture segment.", citations: [{ page: 1 }] }],
    }),
  );
  return lectureId;
}
