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

CREATE TABLE IF NOT EXISTS lectures (
  id SERIAL PRIMARY KEY,
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  student_id TEXT
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
