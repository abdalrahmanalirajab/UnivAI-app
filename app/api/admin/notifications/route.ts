import { NextRequest } from "next/server";

import {
  getAdminNotificationMonitor,
  parseAdminNotificationFilters,
} from "@/lib/admin-notifications";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;

  const rawRegistrationNumber = request.nextUrl.searchParams.get("sid")?.trim() ?? "";
  if (rawRegistrationNumber && !/^S-\d{4}-\d{6}$/.test(rawRegistrationNumber)) {
    return Response.json({ error: "Choose a valid learner." }, { status: 400 });
  }
  const registrationNumber = rawRegistrationNumber || null;

  try {
    const filters = parseAdminNotificationFilters(request.nextUrl.searchParams);
    const monitor = await getAdminNotificationMonitor(registrationNumber, filters);
    if (!monitor) return Response.json({ error: "Learner not found." }, { status: 404 });
    return Response.json(monitor, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid notification")) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message.startsWith("Unknown notification")) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("Notification monitor query failed.");
    return Response.json({ error: "Could not load notification delivery." }, { status: 500 });
  }
}
