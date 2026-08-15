const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const appUrl = (args.get("--url") || process.env.BETTER_AUTH_URL || "http://localhost:3100").replace(/\/$/, "");
const intervalMs = Math.max(15_000, Number(args.get("--interval-ms") || 60_000));
const secret = (process.env.NOTIFICATION_DISPATCH_SECRET || process.env.BETTER_AUTH_SECRET || "").trim();
let stopping = false;

if (secret.length < 24) {
  process.stderr.write("[notifications] dispatcher secret is missing or too short\n");
  process.exit(1);
}

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function dispatch() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${appUrl}/api/notifications/dispatch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      process.stderr.write(`[notifications] dispatch returned HTTP ${response.status}\n`);
      return;
    }
    const result = await response.json();
    const activity = Number(result.claimed || 0) + Number(result.courseUpdatesQueued || 0) +
      Number(result.remindersQueued || 0) + Number(result.transcriptsQueued || 0);
    if (activity > 0) {
      process.stdout.write(`[notifications] processed ${activity} queued or claimed event(s)\n`);
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    process.stderr.write(`[notifications] app unavailable (${name}); retrying\n`);
  } finally {
    clearTimeout(timeout);
  }
}

while (!stopping) {
  await dispatch();
  if (!stopping) await wait(intervalMs);
}
