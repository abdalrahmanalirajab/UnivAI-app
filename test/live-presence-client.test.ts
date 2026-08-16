import { describe, expect, it } from "vitest";
import {
  encodeReliableLiveMessage,
  shouldRecoverLivePresence,
} from "@/lib/live-presence-client";

describe("live presence messages", () => {
  it("uses reliable delivery so a dropped heartbeat cannot strand the lecturer", () => {
    const encoded = encodeReliableLiveMessage({ type: "presence", state: "present" });

    expect(encoded.options).toEqual({ reliable: true });
    expect(JSON.parse(new TextDecoder().decode(encoded.payload))).toEqual({
      type: "presence",
      state: "present",
    });
  });

  it("recovers when the lecturer is waiting despite an active SDK connection", () => {
    expect(shouldRecoverLivePresence(true, "waiting")).toBe(true);
    expect(shouldRecoverLivePresence(false, "waiting")).toBe(false);
    expect(shouldRecoverLivePresence(true, "lecturing")).toBe(false);
  });
});
