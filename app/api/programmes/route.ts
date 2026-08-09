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
 * authoritative generated course length from books.semester_plan and
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

/** How many topics a description names before it starts counting them. */
const MAX_LISTED_TOPICS = 6;

const LIST_FORMAT = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/**
 * One readable course description.
 *
 * Every topic the curriculum agent extracts carries its own full-sentence
 * summary, and joining all of them end to end produced a ~120-word paragraph
 * that restarted with "Covers… Explores… Introduces… Details… Teaches…" once
 * per topic — accurate, but nobody reads it. A description is scanned, so this
 * names the shape of the course and then what it covers. The per-topic
 * summaries are untouched and still reach the client on the topics themselves.
 */
function courseOverview(structure: string, topicTitles: string[], summaries: string[]): string {
  if (topicTitles.length === 0) {
    // Nothing to list: one summary still beats a bare structure line.
    return [structure, summaries[0]].filter(Boolean).join(" ");
  }
  const named = topicTitles.slice(0, MAX_LISTED_TOPICS);
  const remaining = topicTitles.length - named.length;
  const listed = LIST_FORMAT.format(
    remaining > 0 ? [...named, `${remaining} more topic${remaining === 1 ? "" : "s"}`] : named,
  );
  return `${structure} Covers ${listed}.`;
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
    const topicTitles = [...new Set(courseTopics.map((topic) => topic.title.trim()).filter(Boolean))];
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
      description: courseOverview(generatedDetail, topicTitles, summaries),
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
            midterms: 1,
            finals: 1,
          })),
        }]
      : undefined,
  };
}

/**
 * The curriculum for one collection, or null when none has been built.
 *
 * The library needs this to say what its button actually does: "Build" only
 * makes sense before one exists, and once it does, pressing it opens the
 * workspace rather than rebuilding anything.
 *
 * Scoped by the session's registrationNumber, never by anything the client sends.
 */
export async function GET(request: NextRequest) {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  const collectionId = Number(request.nextUrl.searchParams.get("collectionId"));
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return Response.json({ error: "A valid collectionId is required." }, { status: 400 });
  }

  const ownership = await getOwnedCollection(collectionId, gate.registrationNumber);
  if (!ownership.owned) {
    return Response.json(
      { error: ownership.exists ? "You do not have access to this collection." : "Collection not found." },
      { status: ownership.exists ? 403 : 404 },
    );
  }

  const programme = await getProgrammeForCollection(collectionId, gate.registrationNumber);
  return Response.json({ programme: programme ?? null });
}

export async function POST(request: NextRequest) {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  let collectionId: number;
  // Set by the client only after the learner confirms replacing a curriculum
  // they have already shaped. Never an authorization signal — it can only cost
  // the caller their own unapproved edits.
  let rebuildEdited = false;
  try {
    const body = await request.json();
    collectionId = Number(body.collectionId);
    rebuildEdited = body.rebuildEdited === true;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return Response.json({ error: "A valid collectionId is required." }, { status: 400 });
  }

  const ownership = await getOwnedCollection(collectionId, gate.registrationNumber);
  if (!ownership.owned) {
    return Response.json(
      { error: ownership.exists ? "You do not have access to this collection." : "Collection not found." },
      { status: ownership.exists ? 403 : 404 },
    );
  }

  const existing = await getProgrammeForCollection(collectionId, gate.registrationNumber);
  // Older plans mapped every extracted topic to a separate course. Keep
  // approved history immutable, but allow an unapproved legacy plan to be
  // rebuilt below from the generated chapter contract.
  if (existing && (!existing.plan || existing.status === "approved")) {
    return Response.json({ programme: existing });
  }

  const documents = await listDocuments(collectionId, gate.registrationNumber);
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
  // A plan past version 1 has been shaped by the learner — renamed, reordered,
  // merged. Rebuilding throws that away, so it takes an explicit confirmation.
  //
  // The old guard for this compared course IDs against the ready documents,
  // which held for renames and reorders (the IDs survive) but not for a merge:
  // mergeCourses mints "merged_book-7_book-8", the comparison failed, and the
  // route rebuilt over the learner's merge without a word. Asking "has this
  // been edited?" covers every edit operation, including ones added later.
  if (existing && existing.plan_version > 1 && !rebuildEdited) {
    return Response.json(
      {
        error: "This curriculum has been edited. Rebuilding replaces those changes.",
        code: "CURRICULUM_EDITED",
        programme: existing,
      },
      { status: 409 },
    );
  }

  const canonicalCourseIds = new Set(readyDocuments.map((document) => `book-${document.id}`));
  const existingIsCanonical = Boolean(
    existing &&
    existing.plan.courses.length === canonicalCourseIds.size &&
    existing.plan.courses.every((course) => canonicalCourseIds.has(course.id))
  );
  if (existingIsCanonical && !rebuildEdited) return Response.json({ programme: existing });

  const storageKeys = readyDocuments.map((document) =>
    documentStorageKey(collectionId, document.id, document.filename)
  );
  const generatedBooks = await query<{
    filename: string;
    status: string;
    error: string | null;
    generation_ready_weeks: number;
  }>(
    `SELECT filename, status, error, generation_ready_weeks FROM books
      WHERE student_id = $1 AND filename = ANY($2::text[])`,
    [gate.registrationNumber, storageKeys],
  );
  const generatedByFilename = new Map(generatedBooks.map((book) => [book.filename, book]));
  const unfinished = storageKeys.filter(
    (storageKey) => {
      const book = generatedByFilename.get(storageKey);
      // What this curriculum is built from is the chapter plan, and a book
      // waiting for approval already has one — that is the whole point of the
      // plan-only pass. Requiring a generated lecture here would deadlock:
      // lectures wait for approval, approval waits for the curriculum, and the
      // curriculum waited for a lecture.
      const planReady = book?.status === "ready" || book?.status === "awaiting_approval";
      return !book || (!planReady && (book.generation_ready_weeks ?? 0) < 1);
    },
  );
  if (unfinished.length > 0) {
    return Response.json(
      { error: "Your first usable lecture is still being generated. Progress will update automatically." },
      { status: 409 },
    );
  }
  // The current teaching schedule serves one selected book at a time. For that
  // common path, bind the curriculum to the exact chapter-derived structure.
  const generatedPlan = readyDocuments.length === 1
    ? await readGeneratedSemesterPlan(gate.registrationNumber)
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
    [title, String(collectionId), gate.registrationNumber, ...seedQueries],
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
      gate.registrationNumber,
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
    gate.registrationNumber,
    collectionId,
    title,
    nextPlan,
  );
  return Response.json({ programme }, { status: 201 });
}
