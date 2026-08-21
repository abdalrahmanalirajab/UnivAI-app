import "server-only";

import { env } from "./env";

export type LiveSessionTransport = "livekit" | "demo_media";

/** Server-owned transport choice. No URL or client payload can override it. */
export function liveSessionTransport(): LiveSessionTransport {
  const value = env.LIVE_SESSION_TRANSPORT.trim().toLowerCase();
  if (value !== "livekit" && value !== "demo_media") {
    throw new Error("LIVE_SESSION_TRANSPORT must be livekit or demo_media");
  }
  return value;
}

export function isDemoMediaTransport(): boolean {
  return liveSessionTransport() === "demo_media";
}
