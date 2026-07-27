import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/session";
import { createCollection, listCollections } from "@/lib/collections";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  const collections = await listCollections(gate.studentId);
  return Response.json({ collections });
}

export async function POST(request: NextRequest) {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { name } = body;
  if (typeof name !== "string" || name.trim().length === 0) {
    return Response.json({ error: "Name is required." }, { status: 400 });
  }
  const trimmed = name.trim();
  if (trimmed.length > 200) {
    return Response.json(
      { error: "Name must be at most 200 characters." },
      { status: 400 },
    );
  }

  const collection = await createCollection(gate.studentId, trimmed);
  return Response.json({ collection }, { status: 201 });
}
