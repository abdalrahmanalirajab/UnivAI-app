import { spawn } from "child_process";
import path from "path";

/**
 * Bridge from Next.js to the repo's Python side.
 *
 * Used only to reach the team's RAG service: it ingests by absolute file path
 * over MCP, so there is no HTTP endpoint to POST an upload to.
 */

export const REPO_ROOT = path.resolve(process.cwd(), "..");
export const VENV_PYTHON =
  process.platform === "win32"
    ? path.join(REPO_ROOT, ".venv", "Scripts", "python.exe")
    : path.join(REPO_ROOT, ".venv", "bin", "python");

export type PythonResult = { ok: boolean; stdout: string; stderr: string };

export function runPython(
  scriptRelPath: string,
  args: string[],
  timeoutMs = 10 * 60_000
): Promise<PythonResult> {
  return new Promise((resolve) => {
    const child = spawn(VENV_PYTHON, [path.join(REPO_ROOT, scriptRelPath), ...args], {
      cwd: REPO_ROOT,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);

    child.stdout.on("data", (data) => (stdout += String(data)));
    child.stderr.on("data", (data) => (stderr += String(data)));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: stderr + String(err) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}

/** The scripts print one line of JSON; find it even if libraries logged noise. */
export function parseJsonLine<T>(stdout: string): T | null {
  const lines = stdout.trim().split("\n").reverse();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("{")) {
      try {
        return JSON.parse(trimmed) as T;
      } catch {
        continue;
      }
    }
  }
  return null;
}
