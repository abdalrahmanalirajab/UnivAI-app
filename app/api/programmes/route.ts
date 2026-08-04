import path from "path";
import { NextRequest } from "next/server";
import { getOwnedCollection, listDocuments, type Document } from "@/lib/collections";
import { parseJsonLine, runPython } from "@/lib/python";
import {
  createProgrammeIfMissing,
  getProgrammeForCollection,
} from "@/lib/programmes";
import { requireUserApi } from "@/lib/session";
import type { ProgrammePlanV1 } from "@/test/fixtures/programme-plan-v1";

export const dynamic = "force-dynamic";

type AgentCitation = {
  book_title?: string;
  page?: number | null;
  source_filename?: string | null;
};

type AgentTopic = {
  topic_id: string;
  title: string;
  summary: string;
  prerequisites?: string[];
  contact_hours: number;
  total_hours: number;
  citations: AgentCitation[];
};

type AgentPlan = {
  semesters: Array<{
    index: number;
    title: string;
    topics: AgentTopic[];
  }>;
};

type PlanBridgeResponse = {
  ok: boolean;
  error?: string;
  result?: { plan?: AgentPlan };
};

function normalizeFilename(value: string): string {
  return path.basename(value).trim().toLocaleLowerCase();
}

function appPlan(agentPlan: AgentPlan, documents: Document[]): ProgrammePlanV1 {
  const topics = agentPlan.semesters.flatMap((semester) => semester.topics);
  const courses = topics.map((topic) => ({
    id: topic.topic_id,
    title: topic.title,
    credits: Math.max(1, Math.round(topic.total_hours / 15)),
    lecture_hours: Math.max(1, Math.round(topic.contact_hours)),
    tutorial_hours: 0,
    lab_hours: 0,
    description: topic.summary,
  }));
  const coverage = new Map<number, { filename: string; courseIds: Set<string>; pages: Set<number> }>();

  for (const topic of topics) {
    for (const citation of topic.citations ?? []) {
      const citedName = normalizeFilename(citation.source_filename || citation.book_title || "");
      const document = documents.find((candidate) => normalizeFilename(candidate.filename) === citedName);
      if (!document) continue;
      const item = coverage.get(document.id) ?? {
        filename: document.filename,
        courseIds: new Set<string>(),
        pages: new Set<number>(),
      };
      item.courseIds.add(topic.topic_id);
      if (typeof citation.page === "number") item.pages.add(citation.page);
      coverage.set(document.id, item);
    }
  }

  return {
    semesters: agentPlan.semesters.map((semester) => ({
      id: `semester-${semester.index}`,
      name: semester.title,
      order: semester.index,
      course_ids: semester.topics.map((topic) => topic.topic_id),
    })),
    courses,
    prerequisites: topics
      .filter((topic) => (topic.prerequisites?.length ?? 0) > 0)
      .map((topic) => ({ course_id: topic.topic_id, requires: topic.prerequisites ?? [] })),
    workload: {
      total_credits: courses.reduce((total, course) => total + course.credits, 0),
      total_lecture_hours: courses.reduce((total, course) => total + course.lecture_hours, 0),
      total_tutorial_hours: 0,
      total_lab_hours: 0,
      weeks_per_semester: 14,
    },
    source_coverage: [...coverage.entries()].map(([documentId, item]) => ({
      document_id: documentId,
      filename: item.filename,
      course_ids: [...item.courseIds],
      pages: [...item.pages].sort((a, b) => a - b).join(", ") || "Not paginated",
    })),
  };
}

export async function POST(request: NextRequest) {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  let collectionId: number;
  try {
    const body = await request.json();
    collectionId = Number(body.collectionId);
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return Response.json({ error: "A valid collectionId is required." }, { status: 400 });
  }

  const ownership = await getOwnedCollection(collectionId, gate.studentId);
  if (!ownership.owned) {
    return Response.json(
      { error: ownership.exists ? "You do not have access to this collection." : "Collection not found." },
      { status: ownership.exists ? 403 : 404 },
    );
  }

  const existing = await getProgrammeForCollection(collectionId, gate.studentId);
  if (existing) return Response.json({ programme: existing });

  const documents = await listDocuments(collectionId, gate.studentId);
  const readyDocuments = documents.filter((document) => document.status === "ready");
  const stillProcessing = documents.some((document) =>
    document.status === "pending" || document.status === "uploading"
  );
  if (stillProcessing) {
    return Response.json(
      { error: "Your books are still being indexed. Wait until every upload is ready." },
      { status: 409 },
    );
  }
  if (readyDocuments.length === 0) {
    return Response.json(
      { error: "Upload at least one book before building a curriculum." },
      { status: 409 },
    );
  }

  const title = `${ownership.collection.name} Curriculum`;
  const seedQueries = readyDocuments.slice(0, 8).map((document) =>
    `Core topics, concepts, prerequisites, and learning sequence in ${document.filename}`
  );
  const result = await runPython(
    "services/rag-tools/rag_plan.py",
    [title, String(collectionId), gate.studentId, ...seedQueries],
    60 * 60_000,
  );
  const payload = parseJsonLine<PlanBridgeResponse>(result.stdout);
  if (!result.ok || !payload?.ok || !payload.result?.plan) {
    const detail = payload?.error || result.stderr.trim() || "The curriculum Agent did not return a plan.";
    return Response.json({ error: detail }, { status: 502 });
  }

  const programme = await createProgrammeIfMissing(
    gate.studentId,
    collectionId,
    title,
    appPlan(payload.result.plan, readyDocuments),
  );
  return Response.json({ programme }, { status: 201 });
}
