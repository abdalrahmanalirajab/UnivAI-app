import { pool } from "@/lib/db";
import { isStandalone } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await pool.query("SELECT 1");
    return Response.json({
      ok: true,
      ready: true,
      mode: isStandalone() ? "standalone" : "integrated",
      database: "ready",
      adapters: isStandalone()
        ? { agent: "fixture", exam: "fixture", live: "simulator" }
        : { agent: "integrated", exam: "integrated", live: "livekit" },
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
