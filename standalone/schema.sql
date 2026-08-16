CREATE EXTENSION IF NOT EXISTS pg_trgm;

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
  student_id TEXT,
  attended_seconds DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (attended_seconds >= 0),
  is_connected BOOLEAN NOT NULL DEFAULT FALSE,
  presence_last_seen_at TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ,
  last_disconnected_at TIMESTAMPTZ,
  disconnect_count INTEGER NOT NULL DEFAULT 0 CHECK (disconnect_count >= 0),
  last_sentence_index INTEGER NOT NULL DEFAULT 0 CHECK (last_sentence_index >= 0),
  total_sentences INTEGER NOT NULL DEFAULT 0 CHECK (total_sentences >= 0),
  CHECK (total_sentences = 0 OR last_sentence_index <= total_sentences)
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_student_lecture_key
  ON attendance(student_id, lecture_id);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attended_seconds DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_connected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS presence_last_seen_at TIMESTAMPTZ;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS last_connected_at TIMESTAMPTZ;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS last_disconnected_at TIMESTAMPTZ;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS disconnect_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS last_sentence_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS total_sentences INTEGER NOT NULL DEFAULT 0;

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

CREATE TABLE IF NOT EXISTS final_exam_cases (
  student_id TEXT NOT NULL,
  curriculum_id TEXT NOT NULL,
  primary_opens_at TIMESTAMPTZ NOT NULL,
  primary_closes_at TIMESTAMPTZ NOT NULL,
  request_deadline TIMESTAMPTZ NOT NULL,
  primary_exam_id TEXT,
  primary_submitted_at TIMESTAMPTZ,
  primary_result JSONB,
  retake_requested_at TIMESTAMPTZ,
  retake_reason TEXT,
  retake_available_at TIMESTAMPTZ,
  retake_closes_at TIMESTAMPTZ,
  retake_exam_id TEXT,
  retake_submitted_at TIMESTAMPTZ,
  retake_result JSONB,
  declined_at TIMESTAMPTZ,
  -- The Better Auth user table is declared later in this single-file schema;
  -- its foreign key is attached immediately after that table is created.
  declined_by UUID,
  decline_reason TEXT,
  finalized_at TIMESTAMPTZ,
  finalization_reason TEXT CHECK (
    finalization_reason IS NULL OR finalization_reason IN (
      'request_window_expired', 'retake_declined',
      'retake_completed', 'retake_not_taken'
    )
  ),
  official_exam_id TEXT,
  official_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, curriculum_id),
  CHECK (primary_closes_at > primary_opens_at),
  CHECK (request_deadline > primary_closes_at),
  CHECK (
    (retake_requested_at IS NULL AND retake_available_at IS NULL AND retake_closes_at IS NULL)
    OR
    (retake_requested_at IS NOT NULL AND retake_available_at > retake_requested_at
      AND retake_closes_at > retake_available_at)
  )
);
CREATE INDEX IF NOT EXISTS final_exam_cases_request_queue_idx
  ON final_exam_cases (retake_requested_at, retake_available_at)
  WHERE finalized_at IS NULL AND declined_at IS NULL;
CREATE INDEX IF NOT EXISTS final_exam_cases_reconcile_idx
  ON final_exam_cases (request_deadline, retake_closes_at)
  WHERE finalized_at IS NULL;

CREATE TABLE IF NOT EXISTS qa_log (
  id SERIAL PRIMARY KEY,
  lecture_id INTEGER REFERENCES lectures(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_used TEXT,
  asked_at TIMESTAMPTZ NOT NULL,
  student_id TEXT,
  trace_id TEXT NOT NULL DEFAULT gen_random_uuid()::text
);
ALTER TABLE qa_log ADD COLUMN IF NOT EXISTS trace_id TEXT;
UPDATE qa_log
   SET trace_id = gen_random_uuid()::text
 WHERE trace_id IS NULL OR btrim(trace_id) = '';
ALTER TABLE qa_log ALTER COLUMN trace_id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE qa_log ALTER COLUMN trace_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS qa_log_trace_id_key ON qa_log(trace_id);

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
  "registrationNumber" text,
  "uiLocale" text NOT NULL DEFAULT 'en' CHECK ("uiLocale" IN ('en', 'ar')),
  "eulaAccepted" boolean NOT NULL DEFAULT false,
  "eulaVersion" text,
  "eulaAcceptedAt" timestamptz,
  "privacyNoticeAcknowledged" boolean NOT NULL DEFAULT false,
  "privacyNoticeVersion" text,
  "privacyNoticeAcknowledgedAt" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_registrationNumber_key" ON "user"("registrationNumber");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'final_exam_cases_declined_by_fkey'
       AND conrelid = 'final_exam_cases'::regclass
  ) THEN
    ALTER TABLE final_exam_cases
      ADD CONSTRAINT final_exam_cases_declined_by_fkey
      FOREIGN KEY (declined_by) REFERENCES "user"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  registration_number TEXT,
  document_type TEXT NOT NULL CHECK (document_type IN ('eula', 'privacy_notice')),
  document_version TEXT NOT NULL,
  document_hash TEXT NOT NULL,
  context TEXT NOT NULL CHECK (context IN ('email_signup', 'oauth_signup', 'upload', 'settings')),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'ar')),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS legal_acceptances_user_created_idx
  ON legal_acceptances(user_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS legal_acceptances_registration_created_idx
  ON legal_acceptances(registration_number, accepted_at DESC);

CREATE TABLE IF NOT EXISTS privacy_preferences (
  user_id UUID PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  sale_or_sharing_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  limit_sensitive_data_use BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS privacy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  registration_number TEXT,
  request_type TEXT NOT NULL CHECK (request_type IN (
    'access', 'deletion', 'correction', 'portability', 'restriction',
    'objection', 'sale_share_opt_out', 'limit_sensitive_use'
  )),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
    'received', 'identity_check', 'in_progress', 'completed', 'declined', 'cancelled'
  )),
  detail TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
  identity_verified_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  admin_note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS privacy_requests_user_created_idx
  ON privacy_requests(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS privacy_requests_queue_idx
  ON privacy_requests(status, due_at, submitted_at);
CREATE INDEX IF NOT EXISTS user_admin_created_idx
  ON "user"("createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS user_admin_name_search_idx
  ON "user" USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS user_admin_email_search_idx
  ON "user" USING GIN (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS user_admin_registration_search_idx
  ON "user" USING GIN ("registrationNumber" gin_trgm_ops);

CREATE TABLE IF NOT EXISTS ai_output_reactions (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'raise_hand_answer', 'lecture', 'section', 'curriculum'
  )),
  target_id TEXT NOT NULL CHECK (length(target_id) BETWEEN 1 AND 200),
  target_version TEXT NOT NULL CHECK (length(target_version) BETWEEN 1 AND 200),
  trace_id TEXT NOT NULL CHECK (length(trace_id) BETWEEN 1 AND 300),
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  liked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, target_type, target_id, target_version)
);
CREATE INDEX IF NOT EXISTS ai_output_reactions_target_idx
  ON ai_output_reactions(target_type, target_id, target_version);
CREATE INDEX IF NOT EXISTS ai_output_reactions_student_updated_idx
  ON ai_output_reactions(student_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_output_reports (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'raise_hand_answer', 'lecture', 'section', 'curriculum'
  )),
  target_id TEXT NOT NULL CHECK (length(target_id) BETWEEN 1 AND 200),
  target_version TEXT NOT NULL CHECK (length(target_version) BETWEEN 1 AND 200),
  trace_id TEXT NOT NULL CHECK (length(trace_id) BETWEEN 1 AND 300),
  reason TEXT NOT NULL CHECK (reason IN (
    'incorrect', 'unsupported_or_uncited', 'irrelevant',
    'unsafe_or_inappropriate', 'copyright_or_privacy', 'technical_issue'
  )),
  detail TEXT CHECK (detail IS NULL OR length(detail) <= 2000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'reviewing', 'resolved', 'dismissed'
  )),
  admin_note TEXT CHECK (admin_note IS NULL OR length(admin_note) <= 2000),
  reviewed_by UUID REFERENCES "user"("id") ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, target_type, target_id, target_version)
);
CREATE INDEX IF NOT EXISTS ai_output_reports_queue_idx
  ON ai_output_reports(status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ai_output_reports_target_idx
  ON ai_output_reports(target_type, target_id, target_version);

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
  subscribed_at             timestamptz,
  current_period_ends_at    timestamptz,
  cancelled_at              timestamptz,
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
                  CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
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

CREATE INDEX IF NOT EXISTS notification_email_outbox_monitor_idx
  ON notification_email_outbox (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_email_outbox_global_feed_idx
  ON notification_email_outbox (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notification_email_outbox_filter_idx
  ON notification_email_outbox (status, category, event_type, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS notification_email_delivery_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  category    text NOT NULL
                CHECK (category IN (
                  'course', 'lecture', 'assessment', 'transcript', 'security', 'billing'
                )),
  event_type  text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 80),
  subject     text NOT NULL CHECK (length(subject) BETWEEN 1 AND 180),
  status      text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  attempts    integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 1),
  last_error  text,
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS notification_email_delivery_log_monitor_idx
  ON notification_email_delivery_log (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_email_delivery_log_global_feed_idx
  ON notification_email_delivery_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notification_email_delivery_log_filter_idx
  ON notification_email_delivery_log (status, category, event_type, created_at DESC, id DESC);


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

-- Fixed weekly schedules, absence review, admin actions, and provider-aware
-- delivery. Mirrors infra/migrations/027_schedule_absence_admin_email_delivery.sql.
ALTER TABLE programmes
  ADD COLUMN IF NOT EXISTS schedule_timezone text,
  ADD COLUMN IF NOT EXISTS lecture_weekday smallint,
  ADD COLUMN IF NOT EXISTS lecture_local_time time,
  ADD COLUMN IF NOT EXISTS section_weekday smallint,
  ADD COLUMN IF NOT EXISTS section_local_time time,
  ADD COLUMN IF NOT EXISTS schedule_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_lecture_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programmes_schedule_weekdays_valid' AND conrelid = 'programmes'::regclass) THEN
    ALTER TABLE programmes ADD CONSTRAINT programmes_schedule_weekdays_valid CHECK (
      (lecture_weekday IS NULL OR lecture_weekday BETWEEN 0 AND 6)
      AND (section_weekday IS NULL OR section_weekday BETWEEN 0 AND 6)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programmes_schedule_all_or_none' AND conrelid = 'programmes'::regclass) THEN
    ALTER TABLE programmes ADD CONSTRAINT programmes_schedule_all_or_none CHECK (
      (schedule_timezone IS NULL AND lecture_weekday IS NULL AND lecture_local_time IS NULL AND section_weekday IS NULL AND section_local_time IS NULL)
      OR
      (schedule_timezone IS NOT NULL AND lecture_weekday IS NOT NULL AND lecture_local_time IS NOT NULL AND section_weekday IS NOT NULL AND section_local_time IS NOT NULL)
    );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS programmes_schedule_owner_idx ON programmes (student_id, status, schedule_locked_at);

CREATE OR REPLACE FUNCTION prevent_locked_programme_schedule_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.status = 'approved' OR OLD.schedule_locked_at IS NOT NULL)
     AND ROW(
       NEW.schedule_timezone, NEW.lecture_weekday, NEW.lecture_local_time,
       NEW.section_weekday, NEW.section_local_time, NEW.schedule_locked_at,
       NEW.first_lecture_at
     ) IS DISTINCT FROM ROW(
       OLD.schedule_timezone, OLD.lecture_weekday, OLD.lecture_local_time,
       OLD.section_weekday, OLD.section_local_time, OLD.schedule_locked_at,
       OLD.first_lecture_at
     ) THEN
    RAISE EXCEPTION 'An approved programme schedule is immutable.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS programmes_schedule_immutable ON programmes;
CREATE TRIGGER programmes_schedule_immutable
BEFORE UPDATE ON programmes
FOR EACH ROW
EXECUTE FUNCTION prevent_locked_programme_schedule_change();

CREATE TABLE IF NOT EXISTS absence_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('needs_clarification','evidence_required','pending_admin','approved','rejected','expired','withdrawn')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 20 AND 2000),
  waiting_on text NOT NULL CHECK (waiting_on IN ('learner','admin','none')),
  clarification_rounds integer NOT NULL DEFAULT 0 CHECK (clarification_rounds >= 0),
  question_code text,
  recommendation text CHECK (recommendation IS NULL OR recommendation IN ('recommend_excused','recommend_access_only','recommend_unexcused','human_review')),
  policy_clause_ids text[] NOT NULL DEFAULT '{}', sensitivity_flags text[] NOT NULL DEFAULT '{}',
  admin_summary text, ai_confidence numeric(4,3) CHECK (ai_confidence IS NULL OR ai_confidence BETWEEN 0 AND 1),
  outcome text CHECK (outcome IS NULL OR outcome IN ('excused','access_only','unexcused')),
  decision_reason text, submitted_at timestamptz NOT NULL, decided_at timestamptz,
  decided_by uuid REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((status IN ('approved','rejected') AND outcome IS NOT NULL AND decided_at IS NOT NULL) OR status NOT IN ('approved','rejected'))
);
CREATE INDEX IF NOT EXISTS absence_cases_student_idx ON absence_cases (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS absence_cases_admin_queue_idx ON absence_cases (status, submitted_at) WHERE status = 'pending_admin';

CREATE TABLE IF NOT EXISTS absence_case_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES absence_cases(id) ON DELETE CASCADE,
  student_id text NOT NULL, item_type text NOT NULL CHECK (item_type IN ('lecture','quiz')),
  week integer NOT NULL CHECK (week >= 1), lecture_public_id uuid,
  remedy text NOT NULL DEFAULT 'pending' CHECK (remedy IN ('pending','none','exclude_from_denominator','makeup_live')),
  makeup_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (case_id, item_type, week),
  CONSTRAINT absence_case_items_makeup_start_check
    CHECK (makeup_started_at IS NULL OR (item_type = 'lecture' AND remedy = 'makeup_live'))
);
CREATE INDEX IF NOT EXISTS absence_case_items_grade_idx ON absence_case_items (student_id, item_type, week, remedy);
CREATE UNIQUE INDEX IF NOT EXISTS absence_case_items_active_unique ON absence_case_items (student_id, item_type, week) WHERE remedy = 'pending';

-- Upgrade persistent standalone databases created before one-time make-up
-- lectures replaced passive replay/archive access.
ALTER TABLE absence_case_items ADD COLUMN IF NOT EXISTS makeup_started_at timestamptz;
ALTER TABLE absence_case_items DROP CONSTRAINT IF EXISTS absence_case_items_remedy_check;
UPDATE absence_case_items
   SET remedy = CASE WHEN item_type = 'lecture' THEN 'makeup_live' ELSE 'none' END
 WHERE remedy = 'replay';
ALTER TABLE absence_case_items
  ADD CONSTRAINT absence_case_items_remedy_check
  CHECK (remedy IN ('pending','none','exclude_from_denominator','makeup_live'));
ALTER TABLE absence_case_items DROP CONSTRAINT IF EXISTS absence_case_items_makeup_start_check;
ALTER TABLE absence_case_items
  ADD CONSTRAINT absence_case_items_makeup_start_check
  CHECK (makeup_started_at IS NULL OR (item_type = 'lecture' AND remedy = 'makeup_live'));
CREATE INDEX IF NOT EXISTS absence_case_items_makeup_idx
  ON absence_case_items (student_id, lecture_public_id, makeup_started_at)
  WHERE item_type = 'lecture' AND remedy = 'makeup_live';

CREATE TABLE IF NOT EXISTS absence_case_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES absence_cases(id) ON DELETE CASCADE,
  actor text NOT NULL CHECK (actor IN ('system','learner','admin')),
  actor_user_id uuid REFERENCES "user" ("id") ON DELETE SET NULL,
  question_code text,
  response_requested boolean NOT NULL DEFAULT false,
  attachment_requested boolean NOT NULL DEFAULT false,
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 2000), created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS absence_case_messages_case_idx ON absence_case_messages (case_id, created_at ASC);

ALTER TABLE absence_cases DROP CONSTRAINT IF EXISTS absence_cases_clarification_rounds_check;
ALTER TABLE absence_cases DROP CONSTRAINT IF EXISTS absence_cases_clarification_rounds_nonnegative;
ALTER TABLE absence_cases ADD CONSTRAINT absence_cases_clarification_rounds_nonnegative CHECK (clarification_rounds >= 0);
ALTER TABLE absence_case_messages
  ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES "user" ("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS response_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachment_requested boolean NOT NULL DEFAULT false;
ALTER TABLE absence_case_messages DROP CONSTRAINT IF EXISTS absence_case_messages_response_actor_check;
ALTER TABLE absence_case_messages ADD CONSTRAINT absence_case_messages_response_actor_check CHECK (NOT response_requested OR actor = 'admin');
ALTER TABLE absence_case_messages DROP CONSTRAINT IF EXISTS absence_case_messages_attachment_request_check;
ALTER TABLE absence_case_messages ADD CONSTRAINT absence_case_messages_attachment_request_check CHECK (NOT attachment_requested OR response_requested);

CREATE TABLE IF NOT EXISTS absence_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES absence_cases(id) ON DELETE CASCADE,
  student_id text NOT NULL, mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png')),
  original_filename text NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 180),
  byte_length integer NOT NULL CHECK (byte_length BETWEEN 1 AND 5242880),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'), image_data bytea NOT NULL,
  request_message_id uuid REFERENCES absence_case_messages(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (case_id, sha256)
);
CREATE INDEX IF NOT EXISTS absence_evidence_expiry_idx ON absence_evidence (expires_at);
ALTER TABLE absence_evidence ADD COLUMN IF NOT EXISTS request_message_id uuid REFERENCES absence_case_messages(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS absence_evidence_request_unique ON absence_evidence (request_message_id) WHERE request_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS absence_ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES absence_cases(id) ON DELETE CASCADE,
  prompt_id text NOT NULL, prompt_version text NOT NULL, model_label text,
  input_digest text NOT NULL CHECK (input_digest ~ '^[a-f0-9]{64}$'), structured_output jsonb,
  validation_status text NOT NULL CHECK (validation_status IN ('valid','fallback','rejected')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS absence_ai_runs_case_idx ON absence_ai_runs (case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), action_type text NOT NULL CHECK (length(action_type) BETWEEN 1 AND 80),
  entity_type text NOT NULL CHECK (length(entity_type) BETWEEN 1 AND 80), entity_id uuid NOT NULL,
  student_id text, title text NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  safe_summary text NOT NULL CHECK (length(safe_summary) BETWEEN 1 AND 500),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high','urgent')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','assigned','resolved','dismissed')),
  assigned_to uuid REFERENCES "user" ("id") ON DELETE SET NULL, due_at timestamptz,
  resolved_at timestamptz, resolved_by uuid REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (action_type, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS admin_action_items_queue_idx ON admin_action_items (status, priority, due_at, created_at);

UPDATE absence_cases
   SET status = 'pending_admin', waiting_on = 'admin', updated_at = CURRENT_TIMESTAMP
 WHERE status IN ('needs_clarification', 'evidence_required')
   AND NOT EXISTS (
     SELECT 1
       FROM absence_case_messages AS message
      WHERE message.case_id = absence_cases.id
        AND message.actor = 'admin'
        AND message.response_requested = true
   );

INSERT INTO admin_action_items
  (action_type, entity_type, entity_id, student_id, title, safe_summary, priority, status)
SELECT 'absence_review', 'absence_case', absence_case.id, absence_case.student_id,
       'Absence case requires review',
       'A learner is waiting for a human absence decision or information request.',
       CASE
         WHEN absence_case.sensitivity_flags && ARRAY['legal', 'personal_safety']::text[]
           THEN 'high'
         ELSE 'normal'
       END,
       'pending'
  FROM absence_cases AS absence_case
 WHERE absence_case.status = 'pending_admin'
   AND absence_case.outcome IS NULL
ON CONFLICT (action_type, entity_type, entity_id) DO UPDATE
  SET status = 'pending', title = EXCLUDED.title,
      safe_summary = EXCLUDED.safe_summary, priority = EXCLUDED.priority,
      resolved_at = NULL, resolved_by = NULL, updated_at = CURRENT_TIMESTAMP;

ALTER TABLE notification_email_outbox DROP CONSTRAINT IF EXISTS notification_email_outbox_status_check;
UPDATE notification_email_outbox SET status = 'submitted' WHERE status = 'sent';
ALTER TABLE notification_email_outbox ADD CONSTRAINT notification_email_outbox_status_check CHECK (status IN ('pending','processing','submitted','failed','skipped'));
ALTER TABLE notification_email_outbox ADD COLUMN IF NOT EXISTS provider_message_id text, ADD COLUMN IF NOT EXISTS provider_status text NOT NULL DEFAULT 'unknown', ADD COLUMN IF NOT EXISTS provider_event_at timestamptz, ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE notification_email_delivery_log DROP CONSTRAINT IF EXISTS notification_email_delivery_log_status_check;
UPDATE notification_email_delivery_log SET status = 'submitted' WHERE status = 'sent';
ALTER TABLE notification_email_delivery_log ADD CONSTRAINT notification_email_delivery_log_status_check CHECK (status IN ('queued','submitted','failed','skipped'));
ALTER TABLE notification_email_delivery_log ADD COLUMN IF NOT EXISTS provider_message_id text, ADD COLUMN IF NOT EXISTS provider_status text NOT NULL DEFAULT 'unknown', ADD COLUMN IF NOT EXISTS provider_event_at timestamptz, ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE notification_email_outbox DROP CONSTRAINT IF EXISTS notification_email_outbox_provider_status_check;
ALTER TABLE notification_email_outbox ADD CONSTRAINT notification_email_outbox_provider_status_check CHECK (provider_status IN ('unknown','sent','delivered','delayed','bounced','failed','suppressed'));
ALTER TABLE notification_email_delivery_log DROP CONSTRAINT IF EXISTS notification_email_delivery_log_provider_status_check;
ALTER TABLE notification_email_delivery_log ADD CONSTRAINT notification_email_delivery_log_provider_status_check CHECK (provider_status IN ('unknown','sent','delivered','delayed','bounced','failed','suppressed'));
CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_provider_message_idx ON notification_email_outbox (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notification_direct_provider_message_idx ON notification_email_delivery_log (provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_event_id text NOT NULL UNIQUE CHECK (length(provider_event_id) BETWEEN 1 AND 180),
  provider_message_id text NOT NULL CHECK (length(provider_message_id) BETWEEN 1 AND 180),
  event_type text NOT NULL CHECK (event_type IN ('sent','delivered','delayed','bounced','failed','suppressed')),
  payload_digest text NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'), occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS email_provider_events_message_idx ON email_provider_events (provider_message_id, occurred_at DESC);

ALTER TABLE notification_email_outbox DROP CONSTRAINT IF EXISTS notification_email_outbox_category_check;
ALTER TABLE notification_email_outbox ADD CONSTRAINT notification_email_outbox_category_check CHECK (category IN ('course','lecture','assessment','transcript','security','billing','admin'));
ALTER TABLE notification_email_delivery_log DROP CONSTRAINT IF EXISTS notification_email_delivery_log_category_check;
ALTER TABLE notification_email_delivery_log ADD CONSTRAINT notification_email_delivery_log_category_check CHECK (category IN ('course','lecture','assessment','transcript','security','billing','admin'));
