import process from "node:process";

import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";

import { STANDALONE_SID, STANDALONE_USER } from "../lib/runtime";

const USER_ID = "integration-demo-user-000042";
const ACCOUNT_ID = "integration-demo-account-000042";

function safeDatabaseUrl(): string {
  const value =
    process.env.DATABASE_URL ??
    "postgresql://univai:univai@127.0.0.1:5433/univai";
  const url = new URL(value);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error(`Refusing integration seed for non-loopback PostgreSQL: ${url.hostname}`);
  }
  if (url.pathname !== "/univai") {
    throw new Error("Integration seed requires the local 'univai' database");
  }
  return value;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: safeDatabaseUrl() });
  const password = await hashPassword(STANDALONE_USER.password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO "user"
        ("id", "name", "email", "emailVerified", "createdAt", "updatedAt",
         "role", "phone", "studentId")
       VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
               'student', $4, $5)
       ON CONFLICT ("email") DO UPDATE SET
         "name" = EXCLUDED."name",
         "emailVerified" = true,
         "updatedAt" = CURRENT_TIMESTAMP,
         "role" = 'student',
         "phone" = EXCLUDED."phone",
         "studentId" = EXCLUDED."studentId"`,
      [
        USER_ID,
        STANDALONE_USER.name,
        STANDALONE_USER.email,
        STANDALONE_USER.phone,
        STANDALONE_SID,
      ]
    );
    const user = await client.query<{ id: string }>(
      `SELECT "id" FROM "user" WHERE "email" = $1`,
      [STANDALONE_USER.email]
    );
    await client.query(
      `INSERT INTO "account"
        ("id", "accountId", "providerId", "userId", "password",
         "createdAt", "updatedAt")
       VALUES ($1, $2, 'credential', $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO UPDATE SET
         "accountId" = EXCLUDED."accountId",
         "providerId" = EXCLUDED."providerId",
         "userId" = EXCLUDED."userId",
         "password" = EXCLUDED."password",
         "updatedAt" = CURRENT_TIMESTAMP`,
      [ACCOUNT_ID, STANDALONE_USER.email, user.rows[0].id, password]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
  console.log(
    `Integration login: ${STANDALONE_USER.email} / ${STANDALONE_USER.password}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
