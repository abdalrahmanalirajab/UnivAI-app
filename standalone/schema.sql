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
  student_id TEXT,
  source_sha256 TEXT,
  generation_stage TEXT,
  generation_total_weeks INTEGER NOT NULL DEFAULT 0,
  generation_ready_weeks INTEGER NOT NULL DEFAULT 0,
  generation_audio_ready_weeks INTEGER NOT NULL DEFAULT 0,
  -- Liveness beat of a running build; a stale one means the build was
  -- abandoned and a new upload may take it over.
  heartbeat_at TIMESTAMPTZ,
  -- Generated learning content is database-owned (infra/migrations/010).
  semester_plan JSONB,
  generation_manifest JSONB
);
CREATE INDEX IF NOT EXISTS books_student_idx ON books(student_id);

CREATE TABLE IF NOT EXISTS course_generation_milestones (
  id BIGSERIAL PRIMARY KEY,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  week INTEGER NOT NULL CHECK (week >= 0),
  stage TEXT NOT NULL CHECK (stage IN ('plan', 'lecture', 'quiz', 'slides', 'section', 'audio')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'ready', 'failed', 'deferred')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  progress TEXT,
  error TEXT,
  artifact_ref TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (book_id, week, stage)
);
CREATE INDEX IF NOT EXISTS course_generation_milestones_book_idx
  ON course_generation_milestones(book_id, week, stage);

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

-- Public lecture identifiers are database-generated UUIDs, never the sequential
-- primary key (infra/migrations/010).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS lectures (
  id SERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid(),
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
CREATE UNIQUE INDEX IF NOT EXISTS lectures_public_id_key ON lectures(public_id);

-- The generated course itself: one row per taught week, addressed by an opaque
-- UUID. The App reads slides, narration and quizzes from here; nothing reads
-- learner content from disk any more.
CREATE TABLE IF NOT EXISTS lecture_artifacts (
  artifact_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id          INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  student_id       TEXT NOT NULL,
  week             INTEGER NOT NULL CHECK (week > 0),
  title            TEXT NOT NULL,
  lecture_payload  JSONB NOT NULL,
  script_payload   JSONB NOT NULL,
  slides_payload   JSONB NOT NULL,
  quiz_payload     JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (book_id, week)
);
CREATE INDEX IF NOT EXISTS lecture_artifacts_student_week_idx
  ON lecture_artifacts (student_id, week, updated_at DESC);

ALTER TABLE lectures
  ADD COLUMN IF NOT EXISTS lecture_artifact_id UUID
    REFERENCES lecture_artifacts(artifact_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS lectures_lecture_artifact_idx
  ON lectures (lecture_artifact_id);

-- Grounded practicals, addressed by the exact approved plan version.
CREATE TABLE IF NOT EXISTS section_packs (
  section_pack_id       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  schema_version        TEXT NOT NULL CHECK (schema_version = 'section-pack-v1'),
  tenant_id             TEXT NOT NULL,
  programme_id          TEXT NOT NULL,
  course_id             TEXT NOT NULL,
  week                  INTEGER NOT NULL CHECK (week > 0),
  lecture_id            TEXT NOT NULL,
  approved_plan_id      TEXT NOT NULL,
  approved_plan_version INTEGER NOT NULL,
  prompt_id             TEXT NOT NULL,
  prompt_version        TEXT NOT NULL,
  payload_hash          TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  pack_payload          JSONB NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, approved_plan_id, approved_plan_version, week)
);
CREATE INDEX IF NOT EXISTS section_packs_programme_version_idx
  ON section_packs (tenant_id, programme_id, approved_plan_version, week);

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
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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
  -- NULL = not given; Google sign-in supplies no phone (infra/migrations/011).
  "phone" text,
  "registrationNumber" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_registrationNumber_key" ON "user"("registrationNumber");

CREATE TABLE IF NOT EXISTS "session" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "impersonatedBy" text
);
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session"("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
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
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx"
  ON "verification"("identifier");

-- Paid memberships only change optional personalization coins. Every academic
-- route remains available on Free.
CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id                   uuid PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  plan_code                 text NOT NULL DEFAULT 'free'
                              CHECK (plan_code IN ('free', 'supporter', 'patron')),
  pending_plan_code         text
                              CHECK (pending_plan_code IS NULL OR pending_plan_code IN ('supporter', 'patron')),
  status                    text NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'approval_pending', 'suspended', 'cancelled', 'expired')),
  provider                  text NOT NULL DEFAULT 'none'
                              CHECK (provider IN ('none', 'paypal')),
  provider_subscription_id  text UNIQUE,
  provider_plan_id          text,
  created_at                timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coin_wallets (
  user_id            uuid PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  balance            integer NOT NULL DEFAULT 100 CHECK (balance >= 0),
  weekly_allowance   integer NOT NULL DEFAULT 100 CHECK (weekly_allowance >= 0),
  week_started_at    date NOT NULL DEFAULT (date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))::date,
  updated_at         timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coin_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  amount           integer NOT NULL,
  balance_after    integer NOT NULL CHECK (balance_after >= 0),
  reason           text NOT NULL CHECK (reason IN ('signup', 'weekly_refill', 'plan_change', 'spend', 'adjustment')),
  idempotency_key  text NOT NULL UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS coin_transactions_user_created_idx
  ON coin_transactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  event_id                 text PRIMARY KEY,
  event_type               text NOT NULL,
  provider_subscription_id text,
  received_at              timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION initialize_student_subscription()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  initial_week date := (date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))::date;
BEGIN
  INSERT INTO user_subscriptions (user_id)
  VALUES (NEW."id")
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO coin_wallets (user_id, balance, weekly_allowance, week_started_at)
  VALUES (NEW."id", 100, 100, initial_week)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO coin_transactions (user_id, amount, balance_after, reason, idempotency_key)
  VALUES (NEW."id", 100, 100, 'signup', 'signup:' || NEW."id"::text)
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_initialize_subscription ON "user";
CREATE TRIGGER user_initialize_subscription
  AFTER INSERT ON "user"
  FOR EACH ROW
  EXECUTE FUNCTION initialize_student_subscription();

INSERT INTO user_subscriptions (user_id)
SELECT "id" FROM "user"
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO coin_wallets (user_id, balance, weekly_allowance)
SELECT "id", 100, 100 FROM "user"
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO coin_transactions (user_id, amount, balance_after, reason, idempotency_key)
SELECT "id", 100, 100, 'signup', 'signup:' || "id"::text FROM "user"
ON CONFLICT (idempotency_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id       uuid NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  category      text NOT NULL
                  CHECK (category IN ('course', 'lecture', 'assessment', 'transcript')),
  email_enabled boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, category)
);

CREATE TABLE IF NOT EXISTS notification_email_outbox (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key     text NOT NULL UNIQUE CHECK (length(event_key) BETWEEN 1 AND 200),
  user_id       uuid NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  category      text NOT NULL
                  CHECK (category IN (
                    'course', 'lecture', 'assessment', 'transcript', 'security', 'billing'
                  )),
  event_type    text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 80),
  subject       text NOT NULL CHECK (length(subject) BETWEEN 1 AND 180),
  text_body     text NOT NULL CHECK (length(text_body) BETWEEN 1 AND 8000),
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts      integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 8),
  available_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at     timestamptz,
  locked_by     text,
  last_error    text,
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (status = 'processing' AND locked_at IS NOT NULL AND locked_by IS NOT NULL)
    OR status <> 'processing'
  )
);

CREATE INDEX IF NOT EXISTS notification_email_outbox_dispatch_idx
  ON notification_email_outbox (available_at, created_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS notification_email_outbox_user_idx
  ON notification_email_outbox (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_rate_limit_policies (
  user_id          uuid NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  scope            text NOT NULL
                     CHECK (scope IN ('upload', 'generation', 'assessment', 'live', 'feedback', 'account')),
  enabled          boolean NOT NULL DEFAULT true,
  blocked          boolean NOT NULL DEFAULT false,
  max_requests     integer NOT NULL CHECK (max_requests BETWEEN 1 AND 10000),
  window_seconds   integer NOT NULL CHECK (window_seconds BETWEEN 1 AND 86400),
  updated_by       uuid REFERENCES "user" ("id") ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, scope)
);

CREATE TABLE IF NOT EXISTS user_rate_limit_usage (
  user_id          uuid NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  scope            text NOT NULL
                     CHECK (scope IN ('upload', 'generation', 'assessment', 'live', 'feedback', 'account')),
  bucket_start     timestamptz NOT NULL,
  request_count    integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, scope, bucket_start)
);

CREATE INDEX IF NOT EXISTS user_rate_limit_usage_cleanup_idx
  ON user_rate_limit_usage (bucket_start);

CREATE TABLE IF NOT EXISTS course_transcripts (
  id                    text PRIMARY KEY,
  student_id            text NOT NULL,
  course_key            text NOT NULL,
  course_title          text NOT NULL,
  quiz_percentage       numeric(5,2) NOT NULL CHECK (quiz_percentage BETWEEN 0 AND 100),
  attendance_percentage numeric(5,2) NOT NULL CHECK (attendance_percentage BETWEEN 0 AND 100),
  midterm_percentage    numeric(5,2) NOT NULL CHECK (midterm_percentage BETWEEN 0 AND 100),
  final_percentage      numeric(5,2) NOT NULL CHECK (final_percentage BETWEEN 0 AND 100),
  coursework_points     numeric(5,2) NOT NULL CHECK (coursework_points BETWEEN 0 AND 60),
  total_percentage      numeric(5,2) NOT NULL CHECK (total_percentage BETWEEN 0 AND 100),
  letter_grade          text NOT NULL CHECK (letter_grade IN ('F','D','D+','C-','C','C+','B-','B','B+','A-','A','A+','A*')),
  gpa                   numeric(3,2) NOT NULL CHECK (gpa BETWEEN 0 AND 4),
  passed                boolean NOT NULL,
  completed_at          timestamptz NOT NULL,
  review_status         text NOT NULL DEFAULT 'pending'
                          CHECK (review_status IN ('pending', 'held', 'released')),
  release_at            timestamptz NOT NULL,
  reviewed_at           timestamptz,
  reviewed_by           uuid REFERENCES "user" ("id") ON DELETE SET NULL,
  review_note           text,
  notification_queued_at timestamptz,
  created_at            timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, course_key)
);
CREATE INDEX IF NOT EXISTS course_transcripts_student_idx
  ON course_transcripts (student_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS course_transcripts_review_queue_idx
  ON course_transcripts (review_status, release_at, completed_at DESC);
CREATE INDEX IF NOT EXISTS course_transcripts_release_notification_idx
  ON course_transcripts (notification_queued_at, completed_at)
  WHERE review_status = 'released';

CREATE TABLE IF NOT EXISTS certificate_artifacts (
  id            text PRIMARY KEY,
  transcript_id text NOT NULL REFERENCES course_transcripts(id) ON DELETE CASCADE,
  student_id    text NOT NULL,
  template_key  text NOT NULL CHECK (template_key IN ('d','c','b','a','a-star')),
  filename      text NOT NULL,
  mime_type     text NOT NULL DEFAULT 'image/png',
  image_data    bytea NOT NULL,
  issued_at     timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (transcript_id)
);
CREATE INDEX IF NOT EXISTS certificate_artifacts_student_idx
  ON certificate_artifacts (student_id, issued_at DESC);

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
  -- Server-computed SHA-256 of the uploaded bytes; recognises a book the
  -- learner already has. Never a client-supplied value.
  content_sha256 TEXT,
  CONSTRAINT valid_document_status CHECK (status IN ('pending','uploading','ready','failed'))
);
CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents (collection_id);
CREATE INDEX IF NOT EXISTS idx_documents_student    ON documents (student_id);
CREATE INDEX IF NOT EXISTS documents_student_content_idx ON documents (student_id, content_sha256);

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
