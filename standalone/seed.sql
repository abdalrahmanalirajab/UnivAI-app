INSERT INTO settings(key, value) VALUES ('course_size', 'XS')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

DELETE FROM attendance WHERE student_id = 'S-2026-000042';
DELETE FROM output_feedback WHERE student_id = 'S-2026-000042';
DELETE FROM output_versions WHERE student_id = 'S-2026-000042';
DELETE FROM qa_log WHERE student_id = 'S-2026-000042';
DELETE FROM lectures WHERE student_id = 'S-2026-000042';
DELETE FROM grades WHERE student_id = 'S-2026-000042';
DELETE FROM books WHERE student_id = 'S-2026-000042';

INSERT INTO books(id, filename, title, pages, status, uploaded_at, progress, student_id)
VALUES (
  4200,
  'standalone-course.md',
  'Project-authored Standalone Course',
  4,
  'ready',
  '2026-07-27T08:00:00Z',
  'Course ready - deterministic fixtures',
  'S-2026-000042'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  progress = EXCLUDED.progress;

INSERT INTO lectures(id, book_id, week, title, starts_at, status, student_id) VALUES
  (4211, 4200, 1, 'Evidence and Sources', '2026-07-28T10:00:00Z', 'ready', 'S-2026-000042'),
  (4212, 4200, 2, 'Tenant Isolation', '2026-08-04T10:00:00Z', 'ready', 'S-2026-000042'),
  (4213, 4200, 3, 'Explicit Runtime Modes', '2026-08-11T10:00:00Z', 'ready', 'S-2026-000042'),
  (4214, 4200, 4, 'Stable Contracts', '2026-08-18T10:00:00Z', 'ready', 'S-2026-000042')
ON CONFLICT (student_id, week) DO UPDATE SET
  title = EXCLUDED.title,
  starts_at = EXCLUDED.starts_at,
  status = EXCLUDED.status;

INSERT INTO qa_log(
  lecture_id, question, answer, citations, model_used, asked_at, student_id
) VALUES (
  4211,
  'What protects each learner''s material?',
  'Tenant filtering keeps each learner''s material separate.',
  '[{"page":2,"excerpt":"Tenant filtering keeps each learner''s records separate."}]',
  'standalone-fixture',
  '2026-07-28T10:30:00Z',
  'S-2026-000042'
);

INSERT INTO attendance(lecture_id, joined_at, status, late_minutes, completed_at, student_id)
VALUES (
  4211,
  '2026-07-28T10:02:00Z',
  'on_time',
  2,
  '2026-07-28T10:45:00Z',
  'S-2026-000042'
)
ON CONFLICT (student_id, lecture_id) DO UPDATE SET
  status = EXCLUDED.status,
  completed_at = EXCLUDED.completed_at;

INSERT INTO grades(kind, week, score, max_score, feedback, taken_at, exam_id, flagged, report, student_id)
VALUES (
  'quiz',
  1,
  4,
  5,
  'Good use of source evidence.',
  '2026-07-28T11:10:00Z',
  'app-standalone-quiz-1',
  false,
  '{"suspicion_score":0,"flagged":false,"session_status":"completed","events":[]}',
  'S-2026-000042'
)
ON CONFLICT (exam_id) DO UPDATE SET score = EXCLUDED.score, report = EXCLUDED.report;

SELECT setval('books_id_seq', GREATEST((SELECT MAX(id) FROM books), 1));
SELECT setval('lectures_id_seq', GREATEST((SELECT MAX(id) FROM lectures), 1));
