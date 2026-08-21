import {
  DeveloperInputError,
  DeveloperNotFoundError,
  getDeveloperUserTableRecords,
  mutateDeveloperUserTableRecord,
} from "@/lib/developer-users";
import { requireSameOrigin } from "@/lib/same-origin";
import { requireDeveloperApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireDeveloperApi();
  if (gate instanceof Response) return gate;
  try {
    const table = new URL(request.url).searchParams.get("table") ?? "";
    const { userId } = await params;
    const result = await getDeveloperUserTableRecords(userId, table);
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof DeveloperInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof DeveloperNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    console.error("Developer database drilldown failed:", error);
    return Response.json({ error: "Database drilldown failed." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireDeveloperApi();
  if (gate instanceof Response) return gate;
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  try {
    const raw = await request.text();
    if (raw.length > 262_144) return Response.json({ error: "Request is too large." }, { status: 413 });
    const body = JSON.parse(raw) as {
      table?: unknown;
      key?: unknown;
      changes?: unknown;
      confirmation?: unknown;
    };
    if (typeof body.table !== "string") throw new DeveloperInputError("A table is required.");
    const { userId } = await params;
    await mutateDeveloperUserTableRecord(gate, userId, body.table, {
      key: body.key as Record<string, unknown>,
      changes: body.changes as Record<string, unknown>,
      confirmation: typeof body.confirmation === "string" ? body.confirmation : "",
    });
    const result = await getDeveloperUserTableRecords(userId, body.table);
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    if (error instanceof DeveloperInputError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof DeveloperNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    if (typeof error === "object" && error && "code" in error) {
      const code = String((error as { code?: unknown }).code ?? "");
      if (code === "23505") return Response.json({ error: "That value is already in use." }, { status: 409 });
      if (code === "23514" || code === "23503" || code === "22P02" || code === "22007") {
        return Response.json({ error: "The database rejected one of those values." }, { status: 400 });
      }
    }
    console.error("Developer raw record update failed:", error);
    return Response.json({ error: "Raw record update failed." }, { status: 500 });
  }
}
