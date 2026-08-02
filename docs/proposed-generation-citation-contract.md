# Proposed citation contract — generation output

Status: **proposal only.** This issue (UAI-M2-S2-02) does not modify
`lib/generation.ts` — that file is inspect-only here. This document is for
whoever owns the generation pipeline (`UnivAI-Agent/generation/lecture_gen.py`
and the worker that writes `qa_log` / lecture answers).

## What exists today (unchanged by this issue)

- `lib/generation.ts` exports only `spawnGeneration(pdfPath, bookId, quizzesOnly): void`
  — it fires Python detached and returns nothing. It emits no citation data.
- The only real citation identity in this repo:
  - per-segment `citations: { page: number }[]` in `script.json`
    (type `Segment` in `lib/lectures.ts`, validated by
    `validateScript` in `lib/standalone-contracts.ts`)
  - `qa_log.citations JSONB NOT NULL DEFAULT '[]'` (`standalone/schema.sql`)
  - lecture answer payload `pages: number[]` (`app/lecture/[id]/LectureRoom.tsx`)
- `test/fixtures/citation-v1.ts` (added by this issue) defines `CitationV1`
  as the Day-1 contract. `documentId`, `bookTitle` and `excerpt` are
  `null` today — consumers must render an explicit "source unavailable"
  state for them, never a guess.

## Proposed output shape for the generation pipeline

Emit a `citation` object wherever an answer or segment is produced:

```json
{
  "document_id": 3,
  "book_title": "…",
  "pages": [{ "page": 2 }],
  "excerpt": "…"
}
```

- Field names map 1:1 to `CitationV1` (`documentId`, `bookTitle`, `pages`,
  `excerpt`) so consumers need no rename.
- Missing fields are `null` or omitted — consumers render "source unavailable";
  never fabricate book titles, page numbers, or excerpts.
- Persist as JSONB in `qa_log.citations` and include on the answer payload.

## Notes

- Changing field names here requires bumping the schema version marker in
  `test/fixtures/citation-v1.ts` (currently 1.0.0).
- Suggested scope for a future issue: wire `document_id`, `book_title` and
  `excerpt` from UnivAI-Agent generation output into `qa_log` and the answer
  message, then flip the `null` fields in `CitationV1` consumers to real data.
