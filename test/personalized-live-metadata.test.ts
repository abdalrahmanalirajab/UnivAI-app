// @vitest-environment node
//
// Node environment, not jsdom: livekit-server-sdk signs JWTs with
// TextEncoder, and jsdom's TextEncoder returns a Uint8Array from a different
// realm than the one jose's `instanceof Uint8Array` check expects. This test
// touches no DOM, so the Node environment is the correct one.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AccessToken, RoomServiceClient, TokenVerifier } from "livekit-server-sdk";

const {
  mockGate,
  mockQueryOne,
  mockGetLectures,
  mockReadScript,
  mockStampJoin,
  mockEnv,
  mockBlockedMessage,
} = vi.hoisted(() => ({
  mockGate: vi.fn(),
  mockQueryOne: vi.fn(),
  mockGetLectures: vi.fn(),
  mockReadScript: vi.fn(),
  mockStampJoin: vi.fn(),
  mockEnv: {
    LIVEKIT_API_KEY: "test-api-key",
    LIVEKIT_API_SECRET: "test-api-secret-with-enough-entropy",
    LIVEKIT_URL: "wss://test.example.com",
  },
  mockBlockedMessage: {
    not_started: "This lecture has not started yet.",
    too_late: "You are too late.",
    missed: "You missed this lecture.",
    completed: "You have already finished this lecture.",
  },
}));

vi.mock("@/lib/session", () => ({ requireLearningActionApi: mockGate }));
vi.mock("@/lib/db", () => ({ queryOne: mockQueryOne }));
vi.mock("@/lib/attendance", () => ({ stampJoin: mockStampJoin }));
vi.mock("@/lib/lectures", () => ({
  getLectures: mockGetLectures,
  readScript: mockReadScript,
  BLOCKED_MESSAGE: mockBlockedMessage,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

import {
  POST,
  safeSpokenName,
  buildLiveSessionMetadata,
  LIVE_METADATA_VERSION,
  SPOKEN_NAME_MAX_LENGTH,
  TOKEN_TTL_SECONDS,
} from "@/app/api/lecture/[id]/token/route";

const VERIFIER = new TokenVerifier(mockEnv.LIVEKIT_API_KEY, mockEnv.LIVEKIT_API_SECRET);
const listRoomsSpy = vi.spyOn(RoomServiceClient.prototype, "listRooms");
const createRoomSpy = vi.spyOn(RoomServiceClient.prototype, "createRoom");
const updateRoomMetadataSpy = vi.spyOn(RoomServiceClient.prototype, "updateRoomMetadata");

const MOHAMED = {
  registrationNumber: "S-2026-000042",
  name: "Mohamed Hany",
  email: "mohamed@univai.local",
  emailVerified: true,
  role: "student" as const,
  phone: "+201000000042",
  image: null,
  createdAt: "2026-07-01T00:00:00Z",
};

const SARA = {
  registrationNumber: "S-2026-000043",
  name: "Sara Ali",
  email: "sara@univai.local",
  emailVerified: true,
  role: "student" as const,
  phone: "+201000000043",
  image: null,
  createdAt: "2026-07-01T00:00:00Z",
};

const PUBLIC_LECTURE_ID = "11111111-1111-4111-8111-111111111111";
const LECTURE = { id: 1, public_id: PUBLIC_LECTURE_ID, week: 3, title: "Week 3" };

function post(
  id = PUBLIC_LECTURE_ID,
  body: Record<string, unknown> = { name: "Eve Mallory", registrationNumber: "S-ATTACKER-99" },
) {
  return POST(
    new NextRequest(`http://localhost/api/lecture/${id}/token`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function mintAndVerify(
  gate = MOHAMED,
  body: Record<string, unknown> = { name: "Eve Mallory", registrationNumber: "S-ATTACKER-99" },
) {
  mockGate.mockResolvedValue(gate);
  const response = await post(PUBLIC_LECTURE_ID, body);
  expect(response.status).toBe(200);
  const data = (await response.json()) as { token: string };
  const claims = await VERIFIER.verify(data.token);
  const metadata = JSON.parse(claims.metadata ?? "{}") as Record<string, unknown>;
  return { response, data, claims, metadata };
}

describe("safeSpokenName", () => {
  it("collapses and trims whitespace", () => {
    expect(safeSpokenName("  Mohamed\tHany  ")).toBe("Mohamed Hany");
  });

  it("normalizes Unicode (NFKC) and keeps diacritics", () => {
    expect(safeSpokenName("ＭＯＨＡＭＥＤ")).toBe("MOHAMED");
    expect(safeSpokenName("Moḥamed\u00a0Ḥany")).toBe("Moḥamed Ḥany");
  });

  it("strips control and zero-width characters without leaving gaps", () => {
    expect(safeSpokenName("Mo\x00hamed\u0007 Hany")).toBe("Mo hamed Hany");
    expect(safeSpokenName("Mo\u200dhamed")).toBe("Mohamed");
  });

  it("caps over-long names at SPOKEN_NAME_MAX_LENGTH code points, surrogate-safe", () => {
    const long = "A".repeat(100);
    expect(safeSpokenName(long)).toBe("A".repeat(SPOKEN_NAME_MAX_LENGTH));
    const astralTail = "A".repeat(SPOKEN_NAME_MAX_LENGTH) + "😀";
    expect(safeSpokenName(astralTail)).toBe("A".repeat(SPOKEN_NAME_MAX_LENGTH));
  });

  it("returns null for empty, blank, and unpronounceable names", () => {
    expect(safeSpokenName("")).toBeNull();
    expect(safeSpokenName("   ")).toBeNull();
    expect(safeSpokenName("***🚀")).toBeNull();
    expect(safeSpokenName(undefined)).toBeNull();
    expect(safeSpokenName(42)).toBeNull();
  });

  it("keeps speakable letter/number-only forms", () => {
    expect(safeSpokenName("007")).toBe("007");
    expect(safeSpokenName("Abd Al-Raḥmān")).toBe("Abd Al-Raḥmān");
  });
});

describe("buildLiveSessionMetadata", () => {
  it("binds learner, lecture, plan version and a fresh nonce", () => {
    const a = buildLiveSessionMetadata({
      lectureId: PUBLIC_LECTURE_ID,
      week: 3,
      sid: MOHAMED.registrationNumber,
      planVersion: 3,
      spokenName: "Mohamed Hany",
    });
    const b = buildLiveSessionMetadata({
      lectureId: PUBLIC_LECTURE_ID,
      week: 3,
      sid: MOHAMED.registrationNumber,
      planVersion: 3,
      spokenName: "Mohamed Hany",
    });

    expect(a).toEqual({
      v: LIVE_METADATA_VERSION,
      lectureId: PUBLIC_LECTURE_ID,
      week: 3,
      sid: MOHAMED.registrationNumber,
      planVersion: 3,
      nonce: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      spokenName: "Mohamed Hany",
    });
    expect(a.nonce).not.toBe(b.nonce);
  });
});

describe("POST /api/lecture/[id]/token — personalized signed metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGate.mockResolvedValue(MOHAMED);
    mockQueryOne.mockImplementation(async (sql: string) =>
      sql.includes("FROM programmes") ? { id: 7, plan_version: 3 } : LECTURE,
    );
    mockGetLectures.mockResolvedValue([{ id: PUBLIC_LECTURE_ID, joinable: true, blockedReason: null }]);
    mockReadScript.mockResolvedValue({
      lectureId: "course-ai-101",
      title: "Week 3",
      segments: [{ slide: 1, text: "Grounded segment", citations: [{ page: 3 }] }],
    });
    mockStampJoin.mockResolvedValue({ status: "on_time", lateMinutes: 0 });
    listRoomsSpy.mockReset().mockResolvedValue([]);
    createRoomSpy.mockReset().mockResolvedValue({} as never);
    updateRoomMetadataSpy.mockReset().mockResolvedValue({} as never);
  });

  it("mints a verifiable signed token whose metadata holds only the learner's safe spoken name", async () => {
    const { claims, metadata } = await mintAndVerify();

    expect(claims.sub).toBe(MOHAMED.registrationNumber);
    expect(claims.name).toBe("Mohamed Hany");
    expect((claims.video as { room?: string }).room).toBe(
      `lecture-${MOHAMED.registrationNumber}-week-${LECTURE.week}`,
    );

    expect(metadata).toEqual({
      v: LIVE_METADATA_VERSION,
      lectureId: PUBLIC_LECTURE_ID,
      week: 3,
      sid: MOHAMED.registrationNumber,
      planVersion: 3,
      nonce: expect.any(String),
      spokenName: "Mohamed Hany",
    });
    expect(Object.keys(metadata).sort()).toEqual([
      "lectureId",
      "nonce",
      "planVersion",
      "sid",
      "spokenName",
      "v",
      "week",
    ]);
    expect(createRoomSpy).toHaveBeenCalledTimes(1);
    const roomOptions = createRoomSpy.mock.calls[0][0];
    expect(JSON.parse(roomOptions.metadata ?? "{}")).toEqual({
      schema_name: "univai.live.lecture-session",
      schema_version: "2",
      artifact_id: "course-ai-101",
      programme_id: "7",
      course_id: "course-ai-101",
      plan_version: 3,
      week: 3,
      lecture_id: "course-ai-101",
      learner_id: MOHAMED.registrationNumber,
      nonce: metadata.nonce,
      display_name: "Mohamed Hany",
    });
    expect(roomOptions.metadata).not.toContain("Grounded segment");
  });

  it("never puts email, phone, or other profile data in the token", async () => {
    const { claims, metadata } = await mintAndVerify();
    expect(claims).not.toHaveProperty("email");
    expect(claims).not.toHaveProperty("phone");
    expect(metadata).not.toHaveProperty("email");
    expect(metadata).not.toHaveProperty("phone");
  });

  it("is short-lived (explicit TTL, not LiveKit's default 6h)", async () => {
    const { claims } = await mintAndVerify();
    const secondsToExpiry = (claims.exp as number) - Math.floor(Date.now() / 1000);
    expect(secondsToExpiry).toBeGreaterThanOrEqual(TOKEN_TTL_SECONDS - 5);
    expect(secondsToExpiry).toBeLessThanOrEqual(TOKEN_TTL_SECONDS + 5);
  });

  it("ignores client-sent names and ids — authorization wins from the session", async () => {
    const { claims, metadata } = await mintAndVerify();
    expect(claims.name).toBe("Mohamed Hany");
    expect(metadata.spokenName).toBe("Mohamed Hany");
    expect(metadata.sid).toBe(MOHAMED.registrationNumber);
    expect(JSON.stringify(claims)).not.toContain("Eve");
    expect(JSON.stringify(metadata)).not.toContain("Eve");
    expect(JSON.stringify(claims)).not.toContain("ATTACKER");
  });

  it("gives concurrent learners distinct, correct metadata", async () => {
    const mohamed = await mintAndVerify(MOHAMED);
    const sara = await mintAndVerify(SARA);

    expect(mohamed.metadata.spokenName).toBe("Mohamed Hany");
    expect(sara.metadata.spokenName).toBe("Sara Ali");
    expect(mohamed.metadata.sid).toBe(MOHAMED.registrationNumber);
    expect(sara.metadata.sid).toBe(SARA.registrationNumber);
    expect(mohamed.metadata.nonce).not.toBe(sara.metadata.nonce);
    expect(JSON.stringify(sara.metadata)).not.toContain("Mohamed");
    expect(JSON.stringify(mohamed.metadata)).not.toContain("Sara");
  });

  it("falls back to a null spoken name for empty display names", async () => {
    const { claims, metadata } = await mintAndVerify({ ...MOHAMED, name: "   " });
    expect(metadata.spokenName).toBeNull();
    expect(claims.name).toBeUndefined();
  });

  it("falls back to a null spoken name for unpronounceable display names", async () => {
    const { metadata } = await mintAndVerify({ ...MOHAMED, name: "***🚀" });
    expect(metadata.spokenName).toBeNull();
  });

  it("rejects tampered tokens (signature mismatch)", async () => {
    const { data } = await mintAndVerify();
    const [header, payload, signature] = data.token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      metadata: string;
    };
    decoded.metadata = decoded.metadata.replace(
      '"spokenName":"Mohamed Hany"',
      '"spokenName":"Eve Mallory"',
    );
    const swapped = `${header}.${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${signature}`;
    await expect(VERIFIER.verify(swapped)).rejects.toThrow();

    // Corrupt the signature BYTES, not a base64url character. A 32-byte
    // signature is 43 base64url chars and the last one carries only 4
    // significant bits — the other 2 are padding — so swapping it between
    // characters that share those 4 bits ("a" and "b" among them) decodes to
    // the identical signature. Flipping the last character therefore left the
    // token genuinely valid for 6.3% of tokens, and this test failed roughly
    // one run in sixteen.
    const signatureBytes = Buffer.from(signature, "base64url");
    signatureBytes[0] ^= 0xff;
    const corruptedSignature = `${header}.${payload}.${signatureBytes.toString("base64url")}`;
    expect(corruptedSignature).not.toBe(data.token);
    await expect(VERIFIER.verify(corruptedSignature)).rejects.toThrow();
  });

  it("rejects expired tokens", async () => {
    const expired = await new AccessToken(mockEnv.LIVEKIT_API_KEY, mockEnv.LIVEKIT_API_SECRET, {
      identity: MOHAMED.registrationNumber,
      ttl: -60,
    }).toJwt();
    await expect(VERIFIER.verify(expired, 0)).rejects.toThrow();
  });

  it("passes through authentication failures", async () => {
    mockGate.mockResolvedValue(new Response(null, { status: 401 }));
    const response = await post();
    expect(response.status).toBe(401);
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it("rejects a lecture that does not belong to the caller", async () => {
    mockQueryOne.mockResolvedValue(null);
    const response = await post();
    expect(response.status).toBe(404);
  });

  it("rejects a lecture that is not joinable", async () => {
    mockGetLectures.mockResolvedValue([{ id: PUBLIC_LECTURE_ID, joinable: false, blockedReason: "completed" }]);
    const response = await post();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reason: "completed" });
  });

  it("fails closed with 503 when LiveKit is not configured", async () => {
    mockEnv.LIVEKIT_API_SECRET = "";
    try {
      const response = await post();
      expect(response.status).toBe(503);
      expect(mockStampJoin).not.toHaveBeenCalled();
    } finally {
      mockEnv.LIVEKIT_API_SECRET = "test-api-secret-with-enough-entropy";
    }
  });

  it("does not stamp attendance when trusted room setup fails", async () => {
    createRoomSpy.mockRejectedValue(new Error("provider unavailable"));
    listRoomsSpy.mockResolvedValue([]);
    const response = await post();
    expect(response.status).toBe(503);
    expect(mockStampJoin).not.toHaveBeenCalled();
  });

  it("updates metadata on an existing learner room", async () => {
    listRoomsSpy.mockResolvedValue([{}] as never);
    const response = await post();
    expect(response.status).toBe(200);
    expect(createRoomSpy).not.toHaveBeenCalled();
    expect(updateRoomMetadataSpy).toHaveBeenCalledTimes(1);
  });

  it("blocks minting when the approved plan or generated script is absent", async () => {
    mockReadScript.mockResolvedValue(null);
    const response = await post();
    expect(response.status).toBe(409);
    expect(createRoomSpy).not.toHaveBeenCalled();
    expect(mockStampJoin).not.toHaveBeenCalled();
  });
});
