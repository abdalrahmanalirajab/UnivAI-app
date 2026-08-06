import path from "path";
import { NextRequest } from "next/server";
import {
  documentStorageKey,
  getOwnedCollection,
  listDocuments,
  type Document,
} from "@/lib/collections";
import { query } from "@/lib/db";
import { parseJsonLine, runPython } from "@/lib/python";
import {
  createProgrammeIfMissing,
  getProgrammeForCollection,
  updateProgrammePlan,
} from "@/lib/programmes";
import { requireUserApi } from "@/lib/session";
import {
  MAX_SEMESTER_WEEKS,
  readGeneratedSemesterPlan,
  type GeneratedSemesterPlan,
} from "@/lib/semester-plan";
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

/**
 * Weeks a semester is scheduled for.
 *
 * ensureSchedule seeds one lecture row per week from this number, so it decides
 * how many lectures a learner sees. It was hardcoded at 14 — a generic academic
 * semester — which is why a book that generated one week of content still
 * showed fourteen lectures, thirteen of them permanently empty.
 *
 * Before generation discovers the book's chapters, reserve the Agent's
 * three-month per-semester maximum. lib/lectures.ts replaces this placeholder with the
 * authoritative generated course length from lectures/<sid>/semester-plan.json and
 * reconciles the unstarted schedule. Reserving the maximum ensures generation
 * never writes a week for which no lecture row exists.
 */
const WEEKS_PER_SEMESTER = MAX_SEMESTER_WEEKS;

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

function courseTitle(document: Document): string {
  return path.basename(document.filename).replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
}

function topicsForDocument(topics: AgentTopic[], document: Document, documentCount: number): AgentTopic[] {
  const filename = normalizeFilename(document.filename);
  const matched = topics.filter((topic) =>
    (topic.citations ?? []).some((citation) =>
      normalizeFilename(citation.source_filename || citation.book_title || "") === filename
    )
  );
  // With one uploaded book every grounded topic belongs to that course, even
  // when an older Agent response omitted source_filename on a citation.
  return matched.length > 0 || documentCount > 1 ? matched : topics;
}

function appPlan(
  agentPlan: AgentPlan,
  documents: Document[],
  generatedPlan: GeneratedSemesterPlan | null,
): ProgrammePlanV1 {
  const topics = agentPlan.semesters.flatMap((semester) => semester.topics);
  const courses = documents.map((document) => {
    const courseTopics = topicsForDocument(topics, document, documents.length);
    const totalHours = courseTopics.reduce((total, topic) => total + topic.total_hours, 0);
    const contactHours = courseTopics.reduce((total, topic) => total + topic.contact_hours, 0);
    const summaries = [...new Set(courseTopics.map((topic) => topic.summary.trim()).filter(Boolean))];
    const generatedDetail = documents.length === 1 && generatedPlan
      ? `${generatedPlan.chapterCount ?? "Detected"} chapter${generatedPlan.chapterCount === 1 ? "" : "s"} across ${generatedPlan.semesterCount} semester${generatedPlan.semesterCount === 1 ? "" : "s"}.`
      : "One uploaded book, one course.";
    return {
      id: `book-${document.id}`,
      title: courseTitle(document),
      credits: Math.max(1, Math.round(totalHours / 15)),
      lecture_hours: Math.max(1, Math.round(contactHours)),
      tutorial_hours: documents.length === 1 && generatedPlan
        ? generatedPlan.weekCount * 0.75
        : Math.max(1, courseTopics.length),
      lab_hours: 0,
      description: [generatedDetail, ...summaries].join(" "),
    };
  });
  const singleCoursePlan = documents.length === 1 ? generatedPlan : null;
  const courseIds = courses.map((course) => course.id);
  const semesters = singleCoursePlan
    ? singleCoursePlan.semesters.map((semester) => ({
        id: `semester-${semester.semester}`,
        name: `Semester ${semester.semester}`,
        order: semester.semester,
        course_ids: courseIds,
      }))
    : [{ id: "semester-1", name: "Semester 1", order: 1, course_ids: courseIds }];
  const coverage = documents.map((document) => {
    const documentTopics = topicsForDocument(topics, document, documents.length);
    const pages = new Set<number>();
    for (const topic of documentTopics) {
      for (const citation of topic.citations ?? []) {
        if (typeof citation.page === "number") pages.add(citation.page);
      }
    }
    return {
      document_id: document.id,
      filename: document.filename,
      course_ids: [`book-${document.id}`],
      pages: [...pages].sort((a, b) => a - b).join(", ") || "Not paginated",
    };
  });

  return {
    semesters,
    courses,
    // Agent topics are chapters inside their book-course, not independent
    // courses, so topic prerequisites must not create fake course edges.
    prerequisites: [],
    workload: {
      total_credits: courses.reduce((total, course) => total + course.credits, 0),
      total_lecture_hours: courses.reduce((total, course) => total + course.lecture_hours, 0),
      total_tutorial_hours: courses.reduce((total, course) => total + course.tutorial_hours, 0),
      total_lab_hours: 0,
      weeks_per_semester: singleCoursePlan
        ? Math.max(...singleCoursePlan.semesters.map((semester) => semester.weekCount))
        : WEEKS_PER_SEMESTER,
    },
    source_coverage: coverage,
    course_structure: singleCoursePlan
      ? [{
          course_id: courseIds[0],
          chapter_count: singleCoursePlan.chapterCount ?? singleCoursePlan.weekCount,
          semesters: singleCoursePlan.semesters.map((semester) => ({
            semester: semester.semester,
            week_count: semester.weekCount,
            theoretical_lectures: semester.weekCount,
            practical_sections: semester.weekCount,
            quizzes: semester.weekCount,
            midterms: Math.floor(semester.weekCount / 4),
            finals: 1,
          })),
        }]
      : undefined,
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
  // Older plans mapped every extracted topic to a separate course. Keep
  // approved history immutable, but allow an unapproved legacy plan to be
  // rebuilt below from the generated chapter contract.
  if (existing && (!existing.plan || existing.status === "approved")) {
    return Response.json({ programme: existing });
  }

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
  const canonicalCourseIds = new Set(readyDocuments.map((document) => `book-${document.id}`));
  const existingIsCanonical = Boolean(
    existing &&
    existing.plan.courses.length === canonicalCourseIds.size &&
    existing.plan.courses.every((course) => canonicalCourseIds.has(course.id))
  );
  if (existingIsCanonical) return Response.json({ programme: existing });

  const storageKeys = readyDocuments.map((document) =>
    documentStorageKey(collectionId, document.id, document.filename)
  );
  const generatedBooks = await query<{ filename: string; status: string; error: string | null }>(
    `SELECT filename, status, error FROM books
      WHERE student_id = $1 AND filename = ANY($2::text[])`,
    [gate.studentId, storageKeys],
  );
  const generatedByFilename = new Map(generatedBooks.map((book) => [book.filename, book]));
  const unfinished = storageKeys.filter(
    (storageKey) => generatedByFilename.get(storageKey)?.status !== "ready"
  );
  if (unfinished.length > 0) {
    return Response.json(
      { error: "Your books are still being turned into courses. Wait until generation finishes." },
      { status: 409 },
    );
  }
  // The current teaching schedule serves one selected book at a time. For that
  // common path, bind the curriculum to the exact chapter-derived structure.
  const generatedPlan = readyDocuments.length === 1
    ? await readGeneratedSemesterPlan(gate.studentId)
    : null;
  if (readyDocuments.length === 1 && !generatedPlan) {
    return Response.json(
      { error: "Course generation finished without its semester plan. Regenerate the book." },
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

  const nextPlan = appPlan(payload.result.plan, readyDocuments, generatedPlan);
  if (existing) {
    const updated = await updateProgrammePlan(
      existing.id,
      gate.studentId,
      nextPlan,
      existing.plan_version,
    );
    if (!updated.ok) {
      return Response.json(
        { error: updated.error, programme: updated.current },
        { status: 409 },
      );
    }
    return Response.json({ programme: updated.programme });
  }
  const programme = await createProgrammeIfMissing(
    gate.studentId,
    collectionId,
    title,
    nextPlan,
  );
  return Response.json({ programme }, { status: 201 });
}
