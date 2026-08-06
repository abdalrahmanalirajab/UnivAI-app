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

// Filing words a filename carries that a textbook's prose never does, plus the
// ordinal suffixes left behind once digits are stripped ("3rd" -> "rd").
const FILENAME_NOISE = new Set([
  "lec", "lecture", "lectures", "chapter", "chapters", "ch", "part", "pt",
  "section", "unit", "week", "day", "vol", "volume", "edition", "ed",
  "notes", "note", "slides", "slide", "book", "textbook", "draft", "final",
  "copy", "new", "old", "updated", "revised", "scan", "scanned", "pdf",
  "st", "nd", "rd", "th",
]);

/**
 * Subject areas to retrieve evidence for — the Agent's contract for a seed
 * query.
 *
 * It must be answerable FROM the book, not a question ABOUT the book: the
 * Agent keeps a passage as evidence only if the passage carries at least a
 * third of the query's content terms (tools/registry.DEFAULT_MIN_TERM_COVERAGE).
 * Asking for "Core topics, concepts, prerequisites, and learning sequence in
 * MySQL_Lec2.pdf" spends seven of its eight terms on vocabulary no textbook
 * uses, so a real passage on MySQL transactions covers 1/8 of it and every
 * seed is refused with "Retrieved passages do not actually cover this
 * question".
 *
 * So seed with the subject the filename names and nothing else: "MySQL_Lec2.pdf"
 * asks about "MySQL". Broad is correct here — we are asking what the book
 * covers, and hybrid search plus reranking picks the representative passages.
 */
function seedQueryFor(filename: string): string | null {
  const stem = path.basename(filename).replace(/\.[^.]+$/, "");
  const words = stem
    .split(/[^\p{L}\p{N}]+/u)
    // Digits number the file, not the subject ("Lec2", "week1", "3rd"), and
    // every extra term raises the coverage bar the passages have to clear.
    // Stripped rather than dropped, so "Python3" still asks about Python.
    .map((word) => word.replace(/\p{N}+/gu, ""))
    .filter((word) => word.length > 1 && !FILENAME_NOISE.has(word.toLocaleLowerCase()));
  // A filename that is all numbering ("Lec2.pdf") names no subject. Sending
  // the stem raw would only earn a refusal, so let the caller fall back.
  return words.length > 0 ? words.join(" ") : null;
}

function buildSeedQueries(documents: Document[]): string[] {
  const seeds = documents.slice(0, 8).map((document) => seedQueryFor(document.filename));
  const usable = [...new Set(seeds.filter((seed): seed is string => seed !== null))];
  // Every filename was pure numbering. The Agent falls back to the programme
  // objective when it receives no seeds, which is the better guess than a
  // query we already know cannot be grounded.
  return usable;
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
  const seedQueries = buildSeedQueries(readyDocuments);
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
