import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/session";
import {
  createCollection,
  listCollections,
  validateCollectionName,
} from "@/lib/collections";

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
  if (typeof name !== "string") {
    return Response.json({ error: "Name must be a string." }, { status: 400 });
  }

  const validationMsg = validateCollectionName(name);
  if (validationMsg) {
    return Response.json({ error: validationMsg }, { status: 400 });
  }

  const result = await createCollection(gate.studentId, name);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ collection: result.collection }, { status: 201 });
}
