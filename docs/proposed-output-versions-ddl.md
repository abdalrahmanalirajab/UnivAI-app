# Proposed DDL — output versions and trace ids for generated output

Status: **proposal only.** This issue (UAI-M2-S2-02) does not modify
`lib/generation.ts` and does not run migrations — this document is for
whoever owns the parent infra schema and the generation pipeline.

## What exists today (unchanged by this issue)

- `lib/generation.ts` exports only `spawnGeneration(pdfPath, bookId, quizzesOnly): void`
  — it fires Python detached and returns nothing; it emits no version or trace id.
- `books` (`standalone/schema.sql`): `id, filename, title, pages, status,
  error, uploaded_at, progress, student_id` — no version column.
- `qa_log` (`standalone/schema.sql`): `id, lecture_id, question, answer,
  citations, model_used, asked_at, student_id` — no version or trace-id column.
- The only consumers of `output_version` / `trace_id` today are
  `lib/feedback.ts` and `app/api/feedback/route.ts`, which validate the format
  (non-empty strings ≤ 200 characters) and store them on the parent-infra
  `feedback` table; the producers do not exist yet.
- `app/api/retry/route.ts` (added by this issue) re-spawns generation for a
  real book — the only real mechanism — and returns real book state only; it
  cannot mint or persist version tokens until the DDL below lands.
- `test/fixtures/output-version-v1.ts` (added by this issue) defines
  `OutputVersionV1` as the Day-1 contract.

## Proposed DDL (parent infra schema)

```sql
ALTER TABLE qa_log
  ADD COLUMN output_version TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN trace_id TEXT NOT NULL DEFAULT 'local-run';

ALTER TABLE books
  ADD COLUMN output_version TEXT NOT NULL DEFAULT '1.0.0';
```

- Each generation run writes one `output_version` and one `trace_id` to every
  `qa_log` row it produces; previous runs' rows are retained untouched, which
  is the issue's "create a new output version while retaining the previous"
  requirement.
- `books.output_version` is the book's current run — a future revision of
  `app/api/retry/route.ts` would bump it after a successful re-spawn.

## Notes

- Field names map 1:1 to `OutputVersionV1` and to the existing `feedback`
  columns, so consumers need no rename.
- Changing field names requires bumping the schema version marker in
  `test/fixtures/output-version-v1.ts` (currently 1.0.0).
- Suggested scope for a future issue: have UnivAI-Agent write
  `output_version` / `trace_id` into `qa_log`, then make the retry route
  re-read and return the new tokens instead of only `{ ok, bookId, status }`.
