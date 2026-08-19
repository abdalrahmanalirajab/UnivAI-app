import { NextRequest } from "next/server";
import { DataPacket_Kind, RoomServiceClient } from "livekit-server-sdk";

import { queryOne } from "@/lib/db";
import { env } from "@/lib/env";
import { requireLearningActionApi } from "@/lib/session";

export const dynamic = "force-dynamic";

type LiveControlMessage =
  | { type: "raise_hand"; request_id?: string }
  | { type: "mic"; muted: boolean }
  | { type: "retry" }
  | { type: "cancel" }
  | { type: "question"; text: string; credit_reservation_id: string };

function liveKitHttpUrl(url: string): string {
  if (url.startsWith("wss://")) return `https://${url.slice(6)}`;
  if (url.startsWith("ws://")) return `http://${url.slice(5)}`;
  return url;
}

function validMessage(value: unknown): value is LiveControlMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (message.type === "raise_hand") {
    return message.request_id === undefined || (
      typeof message.request_id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        message.request_id,
      )
    );
  }
  if (message.type === "retry" || message.type === "cancel") {
    return true;
  }
  if (message.type === "mic") return typeof message.muted === "boolean";
  return message.type === "question" &&
    typeof message.text === "string" &&
    message.text.trim().length >= 1 &&
    message.text.trim().length <= 2_000 &&
    typeof message.credit_reservation_id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      message.credit_reservation_id,
    );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "Lecture not found." }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  if (!validMessage(body)) {
    return Response.json({ error: "Invalid live lecture action." }, { status: 400 });
  }

  const lecture = await queryOne<{ week: number }>(
    `SELECT week FROM lectures WHERE public_id = $1::uuid AND student_id = $2`,
    [id, gate.registrationNumber],
  );
  if (!lecture) return Response.json({ error: "Lecture not found." }, { status: 404 });

  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    return Response.json({ error: "Live lecture controls are unavailable." }, { status: 503 });
  }

  const room = `lecture-${gate.registrationNumber}-week-${lecture.week}`;
  try {
    await new RoomServiceClient(
      liveKitHttpUrl(env.LIVEKIT_URL),
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET,
    ).sendData(
      room,
      new TextEncoder().encode(JSON.stringify(body)),
      DataPacket_Kind.RELIABLE,
      {},
    );
    return Response.json({ delivered: true });
  } catch (error) {
    console.error("[live] control relay failed", {
      type: body.type,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: "The lecturer is reconnecting. Try again shortly." }, { status: 503 });
  }
}
