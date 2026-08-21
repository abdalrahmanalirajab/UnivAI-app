import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const appRoot = process.cwd();
const campusRoot = path.resolve(appRoot, "..");
const liveRoot = path.join(campusRoot, "UnivAI-live");
const candidates = process.platform === "win32"
  ? [path.join(liveRoot, ".venv", "Scripts", "python.exe"), path.join(campusRoot, ".venv", "Scripts", "python.exe"), "python"]
  : [path.join(liveRoot, ".venv", "bin", "python"), path.join(campusRoot, ".venv", "bin", "python"), "python3"];
const python = candidates.find((candidate) => !path.isAbsolute(candidate) || existsSync(candidate)) ?? candidates[candidates.length - 1];
const mode = process.argv[2];
if (mode !== "prepare" && mode !== "preflight") {
  console.error("Usage: demo-media.ts prepare|preflight [generator arguments]");
  process.exit(2);
}
const forwarded = process.argv.slice(3);
if (mode === "preflight") forwarded.push("--preflight");
const child = spawn(python, [path.join(liveRoot, "prepare_demo_media.py"), ...forwarded], {
  cwd: campusRoot,
  env: process.env,
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(`Could not start the demo-media generator: ${error.message}`);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
