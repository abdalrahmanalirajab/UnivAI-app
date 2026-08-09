import { randomUUID } from "node:crypto";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { env } from "@/lib/env";
import { getSectionPack } from "@/lib/lectures";
import { requireLearningActionApi } from "@/lib/session";

export const dynamic = "force-dynamic";
const TOKEN_TTL_SECONDS = 600;

function httpUrl(url: string): string {
  if (url.startsWith("wss://")) return `https://${url.slice(6)}`;
  if (url.startsWith("ws://")) return `http://${url.slice(5)}`;
  return url;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "No such section." }, { status: 404 });
  }
  const section = await getSectionPack(gate.registrationNumber, id);
  if (!section) return Response.json({ error: "No such section." }, { status: 404 });
  // Open on the clock, like the week's quiz: a section is practice for a
  // lecture that has been delivered, not a reward for staying to the last line.
  if (!section.lectureEnded) {
    return Response.json(
      {
        error: "This section opens when its lecture ends.",
        opensAt: section.lectureEndsAt.toISOString(),
      },
      { status: 403 },
    );
  }

  const { LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret, LIVEKIT_URL: url } = env;
  if (!apiKey || !apiSecret || !url) {
    return Response.json({ error: "LiveKit is not configured." }, { status: 503 });
  }
  const nonce = randomUUID();
  const room = `section-${gate.registrationNumber}-week-${section.week}`;
  const metadata = {
    schema_name: "univai.section-session-meta",
    schema_version: "2.0.0",
    learner_id: gate.registrationNumber,
    section_pack_id: section.id,
    nonce,
  };

  try {
    const service = new RoomServiceClient(httpUrl(url), apiKey, apiSecret);
    const serialized = JSON.stringify(metadata);
    const existing = await service.listRooms([room]);
    if (existing.length) await service.updateRoomMetadata(room, serialized);
    else await service.createRoom({ name: room, metadata: serialized, emptyTimeout: TOKEN_TTL_SECONDS });
  } catch (error) {
    console.error("[live] section room setup failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: "Live section setup failed. Please retry." }, { status: 503 });
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity: gate.registrationNumber,
    name: gate.name,
    ttl: TOKEN_TTL_SECONDS,
    metadata: JSON.stringify({ sectionPackId: section.id, nonce }),
  });
  token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });
  return Response.json({
    token: await token.toJwt(),
    url,
    room,
    section: {
      id: section.id,
      week: section.week,
      title: section.payload.title,
      totalMinutes: section.payload.total_minutes,
      objectives: section.payload.objectives,
    },
  });
}
