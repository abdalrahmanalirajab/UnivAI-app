CREATE SEQUENCE IF NOT EXISTS student_id_seq START 1;

CREATE TABLE IF NOT EXISTS clock_state (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  offset_ms BIGINT NOT NULL DEFAULT 0
);
INSERT INTO clock_state (id, offset_ms) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS books (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  title TEXT,
  pages INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL,
  progress TEXT,
  student_id TEXT
);
CREATE INDEX IF NOT EXISTS books_student_idx ON books(student_id);

-- Generated lecture output lives in content_artifacts; lectures points at it.
-- Mirrors infra/migrations/003_sprint3_learning_flow.sql and 005_lecture_
-- artifact_keys.sql — lib/lectures.readScript and lib/exams JOIN these, so
-- standalone needs them to run the same code paths as integrated mode.
CREATE TABLE IF NOT EXISTS content_artifacts (
  content_key          TEXT PRIMARY KEY CHECK (content_key ~ '^sha256:[a-f0-9]{64}\.pipeline:[a-f0-9]{64}$'),
  schema_version       TEXT NOT NULL CHECK (schema_version = 'content-artifact-v1'),
  original_sha256      TEXT NOT NULL CHECK (original_sha256 ~ '^[a-f0-9]{64}$'),
  pipeline_fingerprint JSONB NOT NULL,
  state                TEXT NOT NULL CHECK (state IN ('building', 'ready', 'failed', 'cleanup_eligible')),
  byte_length          BIGINT NOT NULL CHECK (byte_length > 0),
  page_count           INTEGER NOT NULL CHECK (page_count > 0),
  artifact_checksum    TEXT NOT NULL CHECK (artifact_checksum ~ '^[a-f0-9]{64}$'),
  storage_ref          TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL,
  updated_at           TIMESTAMPTZ NOT NULL,
  UNIQUE (original_sha256, pipeline_fingerprint)
);

CREATE TABLE IF NOT EXISTS lectures (
  id SERIAL PRIMARY KEY,
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  student_id TEXT,
  -- NULL until generation finishes and registers the artifacts.
  script_artifact_key TEXT REFERENCES content_artifacts(content_key) ON DELETE SET NULL,
  slides_artifact_key TEXT REFERENCES content_artifacts(content_key) ON DELETE SET NULL,
  quiz_artifact_key   TEXT REFERENCES content_artifacts(content_key) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS lectures_student_week_key ON lectures(student_id, week);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  lecture_id INTEGER NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  student_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_student_lecture_key
  ON attendance(student_id, lecture_id);

CREATE TABLE IF NOT EXISTS grades (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  week INTEGER,
  score NUMERIC(5,2) NOT NULL,
  max_score NUMERIC(5,2) NOT NULL DEFAULT 100,
  feedback TEXT,
  taken_at TIMESTAMPTZ NOT NULL,
  exam_id TEXT UNIQUE,
  flagged BOOLEAN NOT NULL DEFAULT FALSE,
  report JSONB,
  student_id TEXT
);
CREATE INDEX IF NOT EXISTS grades_student_idx ON grades(student_id);

CREATE TABLE IF NOT EXISTS qa_log (
  id SERIAL PRIMARY KEY,
  lecture_id INTEGER REFERENCES lectures(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_used TEXT,
  asked_at TIMESTAMPTZ NOT NULL,
  student_id TEXT
);

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

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS "user" (
  "id" text NOT NULL PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL,
  "image" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "role" text,
  "banned" boolean,
  "banReason" text,
  "banExpires" timestamptz,
  "phone" text NOT NULL,
  "studentId" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_studentId_key" ON "user"("studentId");

CREATE TABLE IF NOT EXISTS "session" (
  "id" text NOT NULL PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "impersonatedBy" text
);
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session"("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id" text NOT NULL PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account"("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text NOT NULL PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx"
  ON "verification"("identifier");

CREATE TABLE IF NOT EXISTS auth_audit (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  actor_id TEXT,
  actor_email TEXT,
  target_id TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The library flow: collections group a learner's uploaded documents, and a
-- programme is the plan built from one collection. lib/collections.ts and
-- lib/programmes.ts run the same queries in standalone as in integrated mode,
-- so these must match infra/migrations/004_app_library.sql in the parent
-- monorepo.
CREATE TABLE IF NOT EXISTS collections (
  id         SERIAL PRIMARY KEY,
  student_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_collections_student ON collections (student_id);

CREATE TABLE IF NOT EXISTS documents (
  id            SERIAL PRIMARY KEY,
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  student_id    TEXT NOT NULL,
  filename      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_document_status CHECK (status IN ('pending','uploading','ready','failed'))
);
CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents (collection_id);
CREATE INDEX IF NOT EXISTS idx_documents_student    ON documents (student_id);

CREATE TABLE IF NOT EXISTS programmes (
  id            SERIAL PRIMARY KEY,
  student_id    TEXT NOT NULL,
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'proposed',
  plan_version  INTEGER NOT NULL DEFAULT 1,
  plan          JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_programme_status CHECK (status IN ('proposed','approved'))
);
CREATE INDEX IF NOT EXISTS idx_programmes_student    ON programmes (student_id);
CREATE INDEX IF NOT EXISTS idx_programmes_collection ON programmes (collection_id);
