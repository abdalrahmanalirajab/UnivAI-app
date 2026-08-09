import path from "node:path";
import { readFile } from "node:fs/promises";
import { getPresentationMaterialAccess } from "@/lib/lecture-materials";
import { REPO_ROOT } from "@/lib/python";
import { requireLearningActionApi } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; asset?: string[] }> },
) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const { id, asset } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const access = await getPresentationMaterialAccess(gate.registrationNumber, id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!access.available) {
    return new Response(
      access.blockedReason === "not_started"
        ? "The presentation unlocks after the lecture ends."
        : "Join the live lecture to view its presentation.",
      { status: 403 },
    );
  }

  const base = path.resolve(REPO_ROOT, ".cache", "slidev", id);
  const requested = asset?.length === 1 && /^\d+$/.test(asset[0])
    ? ["index.html"]
    : asset?.length ? asset : ["index.html"];
  if (requested.some((part) => part === ".." || part.includes("\\") || part.includes("/"))) {
    return new Response("Not found", { status: 404 });
  }
  const target = path.resolve(base, ...requested);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const body = await readFile(target);
    return new Response(body, {
      headers: {
        "Content-Type": CONTENT_TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": target.endsWith("index.html") ? "private, no-store" : "private, max-age=31536000, immutable",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch {
    return new Response("Presentation is not ready", { status: 404 });
  }
}
