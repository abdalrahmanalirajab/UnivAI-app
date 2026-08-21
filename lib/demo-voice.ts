import "server-only";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { parseJsonLine, runPython } from "./python";
import type { DemoMediaFile } from "./demo-media-contract";

export const ANSWER_RESUME_PROMPT =
  "I hope that clears it up. Now, let us return to where we left off.";

function normalizedText(value: string): string {
  const result = value.replace(/\s+/gu, " ").trim();
  if (!result || result.length > 4_000) throw new Error("Invalid lecturer voice text");
  return result;
}

export function demoAskPrompt(displayName: string): string {
  const name = displayName
    .normalize("NFKC")
    .replace(/[^\p{L} '\-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 80) || "there";
  return `Yes, ${name}? Do you have a question? Unmute your microphone and go ahead.`;
}

function clipIdentity(text: string): { digest: string; file: string } {
  const normalized = normalizedText(text);
  const digest = createHash("sha256").update(normalized, "utf8").digest("hex");
  return {
    digest,
    file: path.resolve(env.DEMO_MEDIA_ROOT, "content", "clips", digest.slice(0, 2), `${digest}.wav`),
  };
}

export async function ensureDemoVoice(text: string, signal?: AbortSignal): Promise<void> {
  const normalized = normalizedText(text);
  const { file } = clipIdentity(normalized);
  if ((await stat(file).catch(() => null))?.isFile()) return;
  const encoded = Buffer.from(normalized, "utf8").toString("base64url");
  const result = await runPython("UnivAI-live/render_demo_voice.py", [encoded], 30_000, signal);
  const output = parseJsonLine<{ ok?: boolean }>(result.stdout);
  if (!result.ok || !output?.ok || !(await stat(file).catch(() => null))?.isFile()) {
    throw new Error("The Piper lecturer voice could not be prepared.");
  }
}

export async function demoVoiceTarget(text: string, signal?: AbortSignal): Promise<{
  file: string;
  media: DemoMediaFile;
}> {
  const normalized = normalizedText(text);
  await ensureDemoVoice(normalized, signal);
  const { digest, file } = clipIdentity(normalized);
  const info = await stat(file);
  return {
    file,
    media: {
      path: `${digest}.wav`,
      mimeType: "audio/wav",
      sha256: "",
      byteLength: info.size,
    },
  };
}
