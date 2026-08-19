import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionAttemptGate, HandAcknowledgement } from "@/lib/live-session-client";

describe("ConnectionAttemptGate", () => {
  it("invalidates the first async join across a mount cleanup/remount", () => {
    const gate = new ConnectionAttemptGate();
    const firstMount = gate.begin();
    gate.cancel();
    const secondMount = gate.begin();

    expect(gate.isCurrent(firstMount)).toBe(false);
    expect(gate.isCurrent(secondMount)).toBe(true);
  });
});

describe("HandAcknowledgement", () => {
  afterEach(() => vi.useRealTimers());

  it("can be acknowledged immediately because its timeout is already armed", () => {
    vi.useFakeTimers();
    const timedOut = vi.fn();
    const acknowledgement = new HandAcknowledgement();

    acknowledgement.start("request-a", timedOut, 5_000);
    expect(acknowledgement.acknowledge("request-a")).toBe(true);
    vi.advanceTimersByTime(5_000);

    expect(timedOut).not.toHaveBeenCalled();
  });

  it("does not let a stale acknowledgement clear the current request", () => {
    vi.useFakeTimers();
    const timedOut = vi.fn();
    const acknowledgement = new HandAcknowledgement();

    acknowledgement.start("request-b", timedOut, 5_000);
    expect(acknowledgement.acknowledge("request-a")).toBe(false);
    vi.advanceTimersByTime(5_000);

    expect(timedOut).toHaveBeenCalledOnce();
  });

  it("does not treat an uncorrelated worker event as the current acknowledgement", () => {
    vi.useFakeTimers();
    const timedOut = vi.fn();
    const acknowledgement = new HandAcknowledgement();

    acknowledgement.start("request-c", timedOut, 5_000);
    expect(acknowledgement.acknowledge()).toBe(false);
    vi.advanceTimersByTime(5_000);

    expect(timedOut).toHaveBeenCalledOnce();
  });
});
