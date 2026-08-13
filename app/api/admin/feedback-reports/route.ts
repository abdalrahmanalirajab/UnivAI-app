import { NextRequest } from "next/server";

import {
  listAdminFeedbackReports,
  parseAdminFeedbackReportFilters,
  reviewAdminFeedbackReport,
} from "@/lib/admin-feedback-reports";
import {
  AI_OUTPUT_REPORT_STATUSES,
  type AiOutputReportStatus,
} from "@/lib/ai-output-feedback-types";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";

function validSid(value: string | null): string | null | false {
  const sid = value?.trim() ?? "";
  if (!sid) return null;
  return /^S-\d{4}-\d{6}$/.test(sid) ? sid : false;
}

export async function GET(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  const registrationNumber = validSid(request.nextUrl.searchParams.get("sid"));
  if (registrationNumber === false) {
    return Response.json({ error: "Choose a valid learner." }, { status: 400 });
  }
  try {
    const filters = parseAdminFeedbackReportFilters(request.nextUrl.searchParams);
    const result = await listAdminFeedbackReports(registrationNumber, filters);
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid report")) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("AI output report queue query failed.");
    return Response.json({ error: "Could not load AI output reports." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  const raw = await request.text();
  if (raw.length > 4096) return Response.json({ error: "Review is too large." }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Send valid JSON." }, { status: 400 });
  }
  const reportId = Number(body.reportId);
  const status = body.status as AiOutputReportStatus;
  const adminNote = typeof body.adminNote === "string" ? body.adminNote.trim() : "";
  if (!Number.isSafeInteger(reportId) || reportId < 1) {
    return Response.json({ error: "Choose a valid report." }, { status: 400 });
  }
  if (!(AI_OUTPUT_REPORT_STATUSES as readonly string[]).includes(status)) {
    return Response.json({ error: "Choose a valid review status." }, { status: 400 });
  }
  if (adminNote.length > 2000) {
    return Response.json({ error: "Admin note must be at most 2000 characters." }, { status: 400 });
  }
  try {
    const report = await reviewAdminFeedbackReport({
      reportId,
      status,
      adminNote: adminNote || null,
      actorId: gate.id,
      actorEmail: gate.email,
    });
    return report
      ? Response.json({ report })
      : Response.json({ error: "Report not found." }, { status: 404 });
  } catch {
    console.error("AI output report review failed.");
    return Response.json({ error: "Could not save the report review." }, { status: 500 });
  }
}

