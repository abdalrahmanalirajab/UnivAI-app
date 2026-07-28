import path from "node:path";
import { env } from "./env";
import { isStandalone } from "./runtime";

export const APP_ROOT = process.cwd();
export const INTEGRATION_ROOT = env.INTEGRATION_ROOT
  ? path.resolve(env.INTEGRATION_ROOT)
  : path.resolve(APP_ROOT, "..");
export const DATA_ROOT = env.DATA_ROOT
  ? path.resolve(env.DATA_ROOT)
  : isStandalone()
    ? path.resolve(APP_ROOT, "standalone")
    : INTEGRATION_ROOT;
export const LECTURES_ROOT = path.resolve(DATA_ROOT, "lectures");
export const UPLOADS_ROOT = path.resolve(DATA_ROOT, "uploads");

export function assertInsideDataRoot(candidate: string): string {
  const resolved = path.resolve(candidate);
  const relative = path.relative(DATA_ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path must stay inside ${DATA_ROOT}`);
  }
  return resolved;
}
