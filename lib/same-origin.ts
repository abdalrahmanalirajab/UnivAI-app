import "server-only";

import { env } from "./env";

/** Reject cross-site state changes before cookies or request bodies are used. */
export function requireSameOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return Response.json({ error: "A same-origin browser request is required." }, { status: 403 });
  const allowed = new Set<string>();
  try { allowed.add(new URL(request.url).origin); } catch { /* invalid request URL fails below */ }
  try { allowed.add(new URL(env.BETTER_AUTH_URL).origin); } catch { /* invalid configured origin fails below */ }
  if (!allowed.has(origin)) return Response.json({ error: "Cross-site request rejected." }, { status: 403 });
  return null;
}
