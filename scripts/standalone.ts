import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

import { STANDALONE_SID, STANDALONE_USER } from "../lib/runtime";

const compose = ["compose", "-f", "docker-compose.standalone.yml"];
const databaseUrl =
  "postgresql://univai:univai@127.0.0.1:5434/univai_app_standalone";
const childEnv = {
  ...process.env,
  UNIVAI_MODE: "standalone",
  UNIVAI_DATA_ROOT: "./standalone",
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_URL: "http://localhost:3100",
  BETTER_AUTH_SECRET: "standalone-local-secret-change-me-32-characters",
  UNIVAI_SCENARIO: process.env.UNIVAI_SCENARIO ?? "happy",
};

function docker(action: "up" | "down"): void {
  const args =
    action === "up" ? [...compose, "up", "-d", "--wait"] : [...compose, "down"];
  const result = spawnSync("docker", args, { stdio: "inherit", shell: false });
  if (result.status !== 0) throw new Error(`docker compose ${action} failed`);
}

function sqlFile(file: string): void {
  const sql = readFileSync(file);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        "univai-app-standalone-postgres",
        "psql",
        "-U",
        "univai",
        "-d",
        "univai_app_standalone",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql, encoding: "utf8", shell: false }
    );
    if (result.status === 0) {
      process.stdout.write(result.stdout);
      return;
    }
    if (!result.stderr.includes("database system is starting up") || attempt === 29) {
      process.stderr.write(result.stderr);
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  throw new Error(`Failed to apply ${file}`);
}

function sqlText(sql: string): string {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      "univai-app-standalone-postgres",
      "psql",
      "-U",
      "univai",
      "-d",
      "univai_app_standalone",
      "-t",
      "-A",
    ],
    { input: sql, encoding: "utf8", shell: false }
  );
  if (result.status !== 0) throw new Error("Standalone SQL command failed");
  return result.stdout.trim();
}

function seed(): void {
  sqlFile("standalone/schema.sql");
  sqlFile("standalone/seed.sql");
}

function reset(): void {
  sqlText(`
    DELETE FROM auth_audit;
    DELETE FROM "session";
    DELETE FROM "account";
    DELETE FROM "verification";
    DELETE FROM "user" WHERE "email" = '${STANDALONE_USER.email}';
    DELETE FROM output_feedback WHERE student_id = '${STANDALONE_SID}';
    DELETE FROM output_versions WHERE student_id = '${STANDALONE_SID}';
    DELETE FROM qa_log WHERE student_id = '${STANDALONE_SID}';
    DELETE FROM grades WHERE student_id = '${STANDALONE_SID}';
    DELETE FROM attendance WHERE student_id = '${STANDALONE_SID}';
    DELETE FROM lectures WHERE student_id = '${STANDALONE_SID}';
    DELETE FROM books WHERE student_id = '${STANDALONE_SID}';
  `);
  console.log("Standalone App data reset.");
}

async function waitForHealth(seconds = 90): Promise<void> {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:3100/api/health");
      if (response.ok) return;
    } catch {
      // Server is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("App did not become healthy on port 3100");
}

async function bootstrapAuth(): Promise<void> {
  const existing = sqlText(
    `SELECT COUNT(*) FROM "user" WHERE "email" = '${STANDALONE_USER.email}';`
  );
  if (existing === "0") {
    const response = await fetch("http://127.0.0.1:3100/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3100" },
      body: JSON.stringify(STANDALONE_USER),
    });
    if (!response.ok) {
      throw new Error(`Better Auth signup failed: ${response.status} ${await response.text()}`);
    }
  }
  sqlText(`
    UPDATE "user"
    SET "emailVerified" = true, "registrationNumber" = '${STANDALONE_SID}', "role" = 'student'
    WHERE "email" = '${STANDALONE_USER.email}';
  `);
  console.log(
    `Seeded login: ${STANDALONE_USER.email} / ${STANDALONE_USER.password}`
  );
}

function smoke(): void {
  docker("up");
  seed();
  const first = sqlText(
    `SELECT COUNT(*) FROM lectures WHERE student_id = '${STANDALONE_SID}';`
  );
  seed();
  const second = sqlText(
    `SELECT COUNT(*) FROM lectures WHERE student_id = '${STANDALONE_SID}';`
  );
  if (first !== "4" || second !== "4") throw new Error("App seed is not idempotent");
  console.log(JSON.stringify({ ok: true, lectures: 4, database: "ready" }));
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "dev";
  if (command === "up" || command === "down") {
    docker(command);
    return;
  }
  if (command === "seed") {
    docker("up");
    seed();
    return;
  }
  if (command === "reset") {
    docker("up");
    reset();
    return;
  }
  if (command === "smoke") {
    smoke();
    return;
  }
  if (command !== "dev") throw new Error(`Unknown standalone command: ${command}`);

  docker("up");
  seed();
  const child = spawn(
    process.execPath,
    [path.resolve("node_modules", "next", "dist", "bin", "next"), "dev", "-p", "3100"],
    { stdio: "inherit", env: childEnv, shell: false }
  );
  const stop = () => child.kill("SIGTERM");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await waitForHealth();
  await bootstrapAuth();
  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
