import { NextRequest } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { queryOne } from "@/lib/db";
import { stampJoin } from "@/lib/attendance";
import { getLectures, BLOCKED_MESSAGE } from "@/lib/lectures";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Mint a LiveKit token for this lecture's room and stamp attendance.
 *
 * The join time comes from the ClockService, so an admin time-jump makes the
 * student on-time, late or absent exactly as the demo requires.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const lectureId = Number(id);

  const lecture = await queryOne<{ id: number; week: number; title: string }>(
    "SELECT id, week, title FROM lectures WHERE id = $1",
    [lectureId]
  );
  if (!lecture) return Response.json({ error: "No such lecture." }, { status: 404 });

  // The doors close halfway through, and a finished lecture cannot be reopened.
  // The UI disables the button; this makes the rule real.
  const schedule = await getLectures();
  const entry = schedule.find((item) => item.id === lectureId);
  if (entry && !entry.joinable) {
    return Response.json(
      { error: BLOCKED_MESSAGE[entry.blockedReason!], reason: entry.blockedReason },
      { status: 403 }
    );
  }

  const apiKey = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;
  const url = env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !url) {
    return Response.json(
      { error: "LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env." },
      { status: 503 }
    );
  }

  // Attendance is recorded the moment the student asks to enter the room.
  const record = await stampJoin(lectureId);

  const room = `lecture-week-${lecture.week}`;
  const token = new AccessToken(apiKey, apiSecret, {
    identity: "student",
    name: "Student",
    // The voice worker reads this to know which script to speak.
    metadata: JSON.stringify({ lectureId, week: lecture.week }),
  });
  token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });

  return Response.json({
    token: await token.toJwt(),
    url,
    room,
    lecture: { id: lecture.id, week: lecture.week, title: lecture.title },
    attendance: record
      ? { status: record.status, lateMinutes: record.lateMinutes }
      : null,
  });
}
