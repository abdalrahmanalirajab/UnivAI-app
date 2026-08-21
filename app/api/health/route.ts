import { pool } from "@/lib/db";
import { isStandalone } from "@/lib/runtime";
import { demoMediaReadiness } from "@/lib/demo-media-server";
import { liveSessionTransport } from "@/lib/live-session-transport";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await pool.query("SELECT 1");
    const transport = liveSessionTransport();
    const media = transport === "demo_media" ? await demoMediaReadiness() : null;
    return Response.json({
      ok: true,
      ready: media ? media.ready : true,
      mode: isStandalone() ? "standalone" : "integrated",
      database: "ready",
      adapters: isStandalone()
        ? { agent: "fixture", exam: "fixture", live: "simulator" }
        : { agent: "integrated", exam: "integrated", live: transport === "demo_media" ? "demo-media" : "livekit" },
      ...(media ? { demoMedia: media } : {}),
      scenario: process.env.UNIVAI_SCENARIO ?? "happy",
    });
  } catch (error) {
    return Response.json(
      {
        ok: true,
        ready: false,
        mode: process.env.UNIVAI_MODE ?? "integrated",
        database: "unavailable",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
