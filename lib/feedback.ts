import { randomUUID } from "node:crypto";
import { pool, query, queryOne } from "./db";
import type { CitationV1 } from "@/test/fixtures/citation-v1";

export type FeedbackRating = "up" | "down";
export type OutputStatus = "ready" | "generating" | "failed";

export type OutputVersion = {
  id: number;
  source_qa_id: number;
  output_version: string;
  trace_id: string;
  book_id: number;
  status: OutputStatus;
  citations: CitationV1[];
  created_at: string;
};

export type FeedbackInput = {
  output_id: number;
  output_version: string;
  trace_id: string;
  rating: FeedbackRating;
  issue: boolean;
  note: string | null;
};

export type Feedback = FeedbackInput & {
  id: number;
  student_id: string;
  created_at: string;
};

export type FeedbackResult =
  | { ok: true; feedback: Feedback }
  | { ok: false; error: string };

type QaSourceRow = {
  source_qa_id: number;
  book_id: number | null;
  book_title: string | null;
  filename: string | null;
  citations: unknown;
};

type OutputRow = Omit<OutputVersion, "citations"> & {
  book_title: string | null;
  filename: string | null;
  source_citations: unknown;
};

let schemaPromise: Promise<void> | null = null;

/**
 * The App is deployed independently from the campus infra schema. Keep this
 * additive migration idempotent so both standalone and integrated databases
 * can accept versioned output feedback without a coordinated deploy.
 */
export function ensureFeedbackSchema(): Promise<void> {
  schemaPromise ??= query(`
    CREATE TABLE IF NOT EXISTS output_versions (
      id BIGSERIAL PRIMARY KEY,
      student_id TEXT NOT NULL,
      source_qa_id BIGINT NOT NULL REFERENCES qa_log(id) ON DELETE CASCADE,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      version INTEGER NOT NULL CHECK (version > 0),
      trace_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('ready', 'generating', 'failed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (student_id, source_qa_id, version)
    );

    CREATE INDEX IF NOT EXISTS output_versions_student_source_idx
      ON output_versions(student_id, source_qa_id, version DESC);

    CREATE TABLE IF NOT EXISTS output_feedback (
      id BIGSERIAL PRIMARY KEY,
      student_id TEXT NOT NULL,
      output_id BIGINT NOT NULL REFERENCES output_versions(id) ON DELETE CASCADE,
      output_version TEXT NOT NULL,
      trace_id TEXT NOT NULL,
      rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
      issue BOOLEAN NOT NULL DEFAULT FALSE,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS output_feedback_student_output_idx
      ON output_feedback(student_id, output_id, created_at DESC);
  `).then(() => undefined).catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

const VALID_RATINGS: readonly FeedbackRating[] = ["up", "down"];

export function validateFeedback(input: FeedbackInput): string | null {
  if (!Number.isInteger(input.output_id) || input.output_id < 1) {
    return "output_id must be a positive integer.";
  }
  if (!input.output_version.trim() || input.output_version.length > 200) {
    return "output_version must be a non-empty string of at most 200 characters.";
  }
  if (!input.trace_id.trim() || input.trace_id.length > 200) {
    return "trace_id must be a non-empty string of at most 200 characters.";
  }
  if (!VALID_RATINGS.includes(input.rating)) {
    return `rating must be one of: ${VALID_RATINGS.join(", ")}.`;
  }
  if (input.note !== null && input.note.trim().length > 2000) {
    return "note must be at most 2000 characters.";
  }
  return null;
}

function citationPages(value: unknown): Array<{ page: number; excerpt: string | null }> {
  if (!Array.isArray(value)) return [];
  const pages: Array<{ page: number; excerpt: string | null }> = [];
  for (const entry of value) {
    const page =
      typeof entry === "number"
        ? entry
        : entry && typeof entry === "object"
          ? Number((entry as Record<string, unknown>).page)
          : Number.NaN;
    if (!Number.isInteger(page) || page < 1) continue;
    const rawExcerpt =
      entry && typeof entry === "object"
        ? (entry as Record<string, unknown>).excerpt
        : null;
    pages.push({
      page,
      excerpt: typeof rawExcerpt === "string" && rawExcerpt.trim() ? rawExcerpt : null,
    });
  }
  return pages;
}

function toOutput(row: OutputRow): OutputVersion {
  const pages = citationPages(row.source_citations);
  const excerpt = pages.map((entry) => entry.excerpt).find(Boolean) ?? null;
  const citation: CitationV1 | null = pages.length
    ? {
        documentId: row.book_id,
        bookTitle: row.book_title ?? row.filename,
        pages: pages.map(({ page }) => ({ page })),
        excerpt,
      }
    : null;
  return {
    id: Number(row.id),
    source_qa_id: Number(row.source_qa_id),
    output_version: row.output_version,
    trace_id: row.trace_id,
    book_id: Number(row.book_id),
    status: row.status,
    citations: citation ? [citation] : [],
    created_at: new Date(row.created_at).toISOString(),
  };
}

async function selectOutput(studentId: string, outputId: number): Promise<OutputVersion | null> {
  const row = await queryOne<OutputRow>(
    `SELECT ov.id, ov.source_qa_id, ov.version::text AS output_version,
            ov.trace_id, ov.book_id, ov.status, ov.created_at,
            b.title AS book_title, b.filename, q.citations AS source_citations
       FROM output_versions ov
       JOIN qa_log q ON q.id = ov.source_qa_id
       JOIN books b ON b.id = ov.book_id
      WHERE ov.id = $1 AND ov.student_id = $2`,
    [outputId, studentId],
  );
  return row ? toOutput(row) : null;
}

export async function getLatestLectureOutput(
  studentId: string,
  lectureId: string,
): Promise<OutputVersion | null> {
  await ensureFeedbackSchema();
  const source = await queryOne<QaSourceRow>(
    `SELECT q.id AS source_qa_id, l.book_id, b.title AS book_title,
            b.filename, q.citations
       FROM qa_log q
       JOIN lectures l ON l.id = q.lecture_id AND l.student_id = q.student_id
       LEFT JOIN books b ON b.id = l.book_id AND b.student_id = q.student_id
      WHERE q.student_id = $1 AND l.public_id = $2::uuid
      ORDER BY q.id DESC
      LIMIT 1`,
    [studentId, lectureId],
  );
  if (!source?.book_id) return null;

  await query(
    `INSERT INTO output_versions
       (student_id, source_qa_id, book_id, version, trace_id, status)
     VALUES ($1, $2, $3, 1, $4, 'ready')
     ON CONFLICT (student_id, source_qa_id, version) DO NOTHING`,
    [studentId, source.source_qa_id, source.book_id, randomUUID()],
  );

  const latest = await queryOne<{ id: number }>(
    `SELECT id FROM output_versions
      WHERE student_id = $1 AND source_qa_id = $2
      ORDER BY version DESC LIMIT 1`,
    [studentId, source.source_qa_id],
  );
  return latest ? selectOutput(studentId, latest.id) : null;
}

export async function submitFeedback(
  studentId: string,
  input: FeedbackInput,
): Promise<FeedbackResult> {
  const validationMessage = validateFeedback(input);
  if (validationMessage) return { ok: false, error: validationMessage };
  await ensureFeedbackSchema();

  const row = await queryOne<Feedback>(
    `INSERT INTO output_feedback
       (student_id, output_id, output_version, trace_id, rating, issue, note)
     SELECT $1, ov.id, $3, $4, $5, $6, $7
       FROM output_versions ov
      WHERE ov.id = $2 AND ov.student_id = $1
        AND ov.version::text = $3 AND ov.trace_id = $4
     RETURNING id, student_id, output_id, output_version, trace_id,
               rating, issue, note, created_at`,
    [
      studentId,
      input.output_id,
      input.output_version,
      input.trace_id,
      input.rating,
      input.issue,
      input.note,
    ],
  );
  return row
    ? { ok: true, feedback: row }
    : { ok: false, error: "The output version does not belong to this learner." };
}

export type RetryResult =
  | { ok: true; output: OutputVersion; filename: string }
  | { ok: false; error: string; status: 404 | 409 };

export async function createRetryVersion(
  studentId: string,
  outputId: number,
): Promise<RetryResult> {
  await ensureFeedbackSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<{
      source_qa_id: number;
      book_id: number;
      filename: string;
      book_status: string;
    }>(
      `SELECT ov.source_qa_id, ov.book_id, b.filename, b.status AS book_status
         FROM output_versions ov
         JOIN books b ON b.id = ov.book_id AND b.student_id = ov.student_id
        WHERE ov.id = $1 AND ov.student_id = $2
        FOR UPDATE OF b`,
      [outputId, studentId],
    );
    const source = selected.rows[0];
    if (!source) {
      await client.query("ROLLBACK");
      return { ok: false, error: "No such output.", status: 404 };
    }
    if (source.book_status === "generating" || source.book_status === "ingesting") {
      await client.query("ROLLBACK");
      return { ok: false, error: "A build is already running — wait for it to finish.", status: 409 };
    }

    const versionResult = await client.query<{ version: number }>(
      `SELECT COALESCE(MAX(version), 0)::integer + 1 AS version
         FROM output_versions
        WHERE student_id = $1 AND source_qa_id = $2`,
      [studentId, source.source_qa_id],
    );
    const version = versionResult.rows[0].version;
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO output_versions
         (student_id, source_qa_id, book_id, version, trace_id, status)
       VALUES ($1, $2, $3, $4, $5, 'generating')
       RETURNING id`,
      [studentId, source.source_qa_id, source.book_id, version, randomUUID()],
    );
    await client.query(
      `UPDATE books SET status = 'generating', error = NULL,
          progress = $1 WHERE id = $2 AND student_id = $3`,
      ["Retrying generation — previous output retained", source.book_id, studentId],
    );
    await client.query("COMMIT");

    const output = await selectOutput(studentId, inserted.rows[0].id);
    if (!output) throw new Error("Retry output was not persisted.");
    return { ok: true, output, filename: source.filename };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function markRetryFailed(
  studentId: string,
  outputId: number,
  message: string,
): Promise<void> {
  await query(
    `WITH failed_output AS (
       UPDATE output_versions
          SET status = 'failed'
        WHERE id = $1 AND student_id = $2
        RETURNING book_id
     )
     UPDATE books
        SET status = 'failed', error = $3, progress = 'Retry failed'
      WHERE id IN (SELECT book_id FROM failed_output) AND student_id = $2`,
    [outputId, studentId, message.slice(0, 1000)],
  );
}
