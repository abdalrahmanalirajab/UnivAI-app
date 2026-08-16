export function encodeReliableLiveMessage(message: Record<string, unknown>) {
  return {
    payload: new TextEncoder().encode(JSON.stringify(message)),
    options: { reliable: true as const },
  };
}

export function shouldRecoverLivePresence(connected: boolean, agentState: string): boolean {
  return connected && agentState === "waiting";
}
