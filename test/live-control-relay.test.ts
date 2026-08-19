// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DataPacket_Kind, RoomServiceClient } from "livekit-server-sdk";

const { gate, query, mockEnv } = vi.hoisted(() => ({
  gate: vi.fn(),
  query: vi.fn(),
  mockEnv: {
    LIVEKIT_URL: "wss://live.example.test",
    LIVEKIT_API_KEY: "test-key",
    LIVEKIT_API_SECRET: "test-secret",
  },
}));

vi.mock("@/lib/session", () => ({ requireLearningActionApi: gate }));
vi.mock("@/lib/db", () => ({ queryOne: query }));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

import { POST } from "@/app/api/lecture/[id]/control/route";

const LECTURE_ID = "11111111-1111-4111-8111-111111111111";
const sendData = vi.spyOn(RoomServiceClient.prototype, "sendData");

function request(body: unknown) {
  return POST(
    new NextRequest(`http://localhost/api/lecture/${LECTURE_ID}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: LECTURE_ID }) },
  );
}

describe("live control relay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gate.mockResolvedValue({ registrationNumber: "S-2026-000042" });
    query.mockResolvedValue({ week: 3 });
    sendData.mockResolvedValue(undefined);
  });

  it("relays a raise-hand command when the browser data channel is unavailable", async () => {
    const requestId = "22222222-2222-4222-8222-222222222222";
    const response = await request({ type: "raise_hand", request_id: requestId });

    expect(response.status).toBe(200);
    expect(sendData).toHaveBeenCalledOnce();
    const [room, payload, kind] = sendData.mock.calls[0];
    expect(room).toBe("lecture-S-2026-000042-week-3");
    expect(kind).toBe(DataPacket_Kind.RELIABLE);
    expect(JSON.parse(new TextDecoder().decode(payload))).toEqual({
      type: "raise_hand",
      request_id: requestId,
    });
  });

  it("rejects malformed raised-hand request ids", async () => {
    const response = await request({ type: "raise_hand", request_id: "not-a-request-id" });
    expect(response.status).toBe(400);
    expect(sendData).not.toHaveBeenCalled();
  });

  it("rejects untrusted control payloads", async () => {
    const response = await request({ type: "question", text: "hello", credit_reservation_id: "bad" });

    expect(response.status).toBe(400);
    expect(sendData).not.toHaveBeenCalled();
  });
});
