# DDL — collections, documents, programmes

Style follows `infra/schema.sql` from the parent monorepo.

**Status: shipped.** This DDL is applied by `infra/migrations/004_app_library.sql`
(version 4, `app_library`, in `core_schema_migrations`) in the parent monorepo,
and mirrored in this repo's `standalone/schema.sql`. Change all three together.

```sql
-- Collections group documents uploaded by a student.
CREATE TABLE IF NOT EXISTS collections (
  id         SERIAL PRIMARY KEY,
  student_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collections_student ON collections (student_id);

-- Documents inside a collection, tracked per upload workflow.
CREATE TABLE IF NOT EXISTS documents (
  id            SERIAL PRIMARY KEY,
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  student_id    TEXT NOT NULL,
  filename      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',     -- pending | uploading | ready | failed
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_document_status CHECK (status IN ('pending','uploading','ready','failed'))
);

CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents (collection_id);
CREATE INDEX IF NOT EXISTS idx_documents_student    ON documents (student_id);

-- Programme is the approved/academic plan built from one collection's documents.
CREATE TABLE IF NOT EXISTS programmes (
  id             SERIAL PRIMARY KEY,
  student_id     TEXT NOT NULL,
  collection_id  INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'proposed',    -- proposed | approved
  plan_version   INTEGER NOT NULL DEFAULT 1,
  plan           JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_programme_status CHECK (status IN ('proposed','approved'))
);

CREATE INDEX IF NOT EXISTS idx_programmes_student      ON programmes (student_id);
CREATE INDEX IF NOT EXISTS idx_programmes_collection   ON programmes (collection_id);
```

## Notes

- All timestamps use `TIMESTAMPTZ` and `DEFAULT NOW()` (matching `clock_state`, `books`, `lectures`, etc. in the existing schema).
- Foreign keys to `collections(id)` use `ON DELETE CASCADE`, matching the `lectures → books` convention.
- `plan` is `JSONB` — the existing code inserts it with `$4::jsonb` and the `ProgrammePlanV1` type.
- `status` columns use a `CHECK` constraint for the limited enum values the TS types define.
- Indexes follow the pattern of columns used in `WHERE` clauses in `lib/collections.ts` and `lib/programmes.ts`.
