/** Guards async joins so a cancelled React effect cannot finish a stale join. */
export class ConnectionAttemptGate {
  private generation = 0;

  begin(): number {
    this.generation += 1;
    return this.generation;
  }

  cancel(): void {
    this.generation += 1;
  }

  isCurrent(attempt: number): boolean {
    return attempt === this.generation;
  }
}

/** Correlates one raised-hand request with its worker acknowledgement. */
export class HandAcknowledgement {
  private requestId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  start(requestId: string, onTimeout: () => void, timeoutMs: number): void {
    this.cancel();
    this.requestId = requestId;
    this.timer = setTimeout(() => {
      if (this.requestId !== requestId) return;
      this.requestId = null;
      this.timer = null;
      onTimeout();
    }, timeoutMs);
  }

  acknowledge(requestId?: string): boolean {
    if (!this.requestId) return false;
    if (requestId !== this.requestId) return false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    return true;
  }

  finish(requestId?: string): boolean {
    if (!this.acknowledge(requestId)) return false;
    this.requestId = null;
    return true;
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.requestId = null;
  }

  currentRequestId(): string | null {
    return this.requestId;
  }
}
