import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { pool, query } from "../lib/db";
import { ensureSchedule } from "../lib/lectures";

type Account = { sid: string };

async function prepareAllCurrent(): Promise<number> {
  const appRoot = process.cwd();
  const campusRoot = path.resolve(appRoot, "..");
  const liveRoot = path.join(campusRoot, "UnivAI-live");
  const candidates = process.platform === "win32"
    ? [path.join(liveRoot, ".venv", "Scripts", "python.exe"), path.join(campusRoot, ".venv", "Scripts", "python.exe"), "python"]
    : [path.join(liveRoot, ".venv", "bin", "python"), path.join(campusRoot, ".venv", "bin", "python"), "python3"];
  const python = candidates.find((candidate) => !path.isAbsolute(candidate) || existsSync(candidate)) ?? candidates[candidates.length - 1];
  return new Promise((resolve) => {
    const child = spawn(python, [path.join(liveRoot, "prepare_demo_media.py"), "--all-current"], {
      cwd: campusRoot,
      env: { ...process.env, LIVE_SESSION_TRANSPORT: "demo_media" },
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", (error) => {
      console.error(`FAILED demo-media backfill: ${error.message}`);
      resolve(1);
    });
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  let scheduleFailures = 0;
  const accounts = await query<Account>(
    `SELECT DISTINCT u."registrationNumber" AS sid
       FROM "user" AS u
       JOIN programmes AS p
         ON p.student_id = u."registrationNumber" AND p.status = 'approved'
      WHERE u."registrationNumber" IS NOT NULL
      ORDER BY u."registrationNumber"`,
  );
  for (const account of accounts) {
    try {
      await ensureSchedule(account.sid);
      console.log(`READY ${account.sid} schedule`);
    } catch (error) {
      scheduleFailures += 1;
      console.error(
        `FAILED ${account.sid} schedule: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  console.log(`Preparing media for ${accounts.length} approved account(s)…`);
  const mediaCode = await prepareAllCurrent();
  await pool.end();
  process.exitCode = scheduleFailures === 0 && mediaCode === 0 ? 0 : 1;
}

void main().catch(async (error) => {
  console.error(`FAILED demo-media backfill: ${error instanceof Error ? error.message : "Unknown error"}`);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
