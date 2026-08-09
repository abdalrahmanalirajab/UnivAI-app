import { access } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3117";
const databaseURL =
  process.env.DATABASE_URL ??
  "postgresql://univai:univai@127.0.0.1:5434/univai_app_standalone";

test("unverified learners cannot reach or forge uploads, while verified learners can", async ({
  page,
}) => {
  const email = `verified-upload-${process.pid}-${Date.now()}@univai.local`;
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: baseURL },
    data: {
      email,
      password: "VerifiedUpload123!",
      name: "Verification Boundary",
      phone: "+201000000022",
    },
  });
  expect(signup.ok(), await signup.text()).toBe(true);

  const pool = new Pool({ connectionString: databaseURL });
  try {
    const learner = await pool.query<{ registrationNumber: string }>(
      'SELECT "registrationNumber" FROM "user" WHERE email = $1',
      [email],
    );
    const sid = learner.rows[0]?.registrationNumber;
    expect(sid).toBeTruthy();

    await page.goto("/upload");
    await expect(page).toHaveURL(/\/verify-email$/);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);

    const forged = await page.request.post("/api/upload", {
      multipart: {
        file: {
          name: "forged.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4\nforged upload"),
        },
      },
    });
    expect(forged.status()).toBe(403);
    expect(await forged.json()).toEqual({
      error: "Verify your email to use this feature.",
      code: "EMAIL_VERIFICATION_REQUIRED",
    });

    const books = await pool.query(
      "SELECT id FROM books WHERE student_id = $1",
      [sid],
    );
    const lectures = await pool.query(
      "SELECT id FROM lectures WHERE student_id = $1",
      [sid],
    );
    expect(books.rowCount).toBe(0);
    expect(lectures.rowCount).toBe(0);

    for (const table of ["collections", "documents"] as const) {
      const exists = await pool.query<{ table: string | null }>(
        "SELECT to_regclass($1) AS table",
        [`public.${table}`],
      );
      if (exists.rows[0]?.table) {
        const rows = await pool.query(
          `SELECT 1 FROM ${table} WHERE student_id = $1`,
          [sid],
        );
        expect(rows.rowCount).toBe(0);
      }
    }

    const rejectedUploadDirectory = path.resolve(
      process.cwd(),
      "..",
      "uploads",
      sid,
    );
    await expect(access(rejectedUploadDirectory)).rejects.toThrow();

    await pool.query(
      'UPDATE "user" SET "emailVerified" = TRUE WHERE email = $1',
      [email],
    );

    await page.goto("/upload");
    await expect(page).toHaveURL(/\/upload$/);
    await expect(page.locator('input[type="file"]')).toHaveCount(1);

    const verifiedRequest = await page.request.post("/api/upload");
    expect(verifiedRequest.status()).toBe(400);
    expect(await verifiedRequest.json()).toEqual({ error: "No file uploaded." });
  } finally {
    await pool.end();
  }
});
