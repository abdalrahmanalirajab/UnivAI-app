DELETE FROM attendance WHERE student_id = 'S-2026-000042';
DELETE FROM ai_output_reports WHERE student_id = 'S-2026-000042';
DELETE FROM ai_output_reactions WHERE student_id = 'S-2026-000042';
DELETE FROM output_feedback WHERE student_id = 'S-2026-000042';
DELETE FROM output_versions WHERE student_id = 'S-2026-000042';
DELETE FROM qa_log WHERE student_id = 'S-2026-000042';
DELETE FROM lecture_artifacts WHERE student_id = 'S-2026-000042';
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

-- public_id is what the app puts in a lecture URL; the sequential id is never
-- exposed. It is pinned here rather than defaulted so a fixture lecture has a
-- stable address the demo specs can navigate to.
INSERT INTO lectures(id, public_id, book_id, week, title, starts_at, status, student_id) VALUES
  (4211, '11111111-1111-4111-8111-000000004211', 4200, 1, 'Evidence and Sources', '2026-07-28T10:00:00Z', 'ready', 'S-2026-000042'),
  (4212, '11111111-1111-4111-8111-000000004212', 4200, 2, 'Tenant Isolation', '2026-08-04T10:00:00Z', 'ready', 'S-2026-000042'),
  (4213, '11111111-1111-4111-8111-000000004213', 4200, 3, 'Explicit Runtime Modes', '2026-08-11T10:00:00Z', 'ready', 'S-2026-000042'),
  (4214, '11111111-1111-4111-8111-000000004214', 4200, 4, 'Stable Contracts', '2026-08-18T10:00:00Z', 'ready', 'S-2026-000042')
ON CONFLICT (student_id, week) DO UPDATE SET
  public_id = EXCLUDED.public_id,
  title = EXCLUDED.title,
  starts_at = EXCLUDED.starts_at,
  status = EXCLUDED.status;

-- The generated course itself. Content moved out of standalone/lectures/*.json
-- when generated learning artifacts became database-owned; these rows are the
-- same fixture text, stored where the App now reads it from.
DELETE FROM lecture_artifacts WHERE student_id = 'S-2026-000042';

INSERT INTO lecture_artifacts(
  artifact_id, book_id, student_id, week, title,
  lecture_payload, script_payload, slides_payload, quiz_payload
) VALUES
  ('00000000-0000-4000-8000-000000004211', 4200, 'S-2026-000042', 1, 'Evidence and Sources',
   '{"title": "Evidence and Sources", "intro": "Welcome to the project-authored standalone course.", "durationMinutes": 45, "slides": [{"heading": "Evidence and Sources — point 1", "bullets": ["Reliable answers cite supplied learning material and refuse unsupported claims."], "page": 1, "narration": "Reliable answers cite supplied learning material and refuse unsupported claims."}, {"heading": "Evidence and Sources — point 2", "bullets": ["Source metadata makes the answer traceable."], "page": 1, "narration": "Source metadata makes the answer traceable."}]}'::jsonb,
   '{"title": "Evidence and Sources", "durationMinutes": 45, "segments": [{"slide": 1, "text": "Welcome to the project-authored standalone course.", "citations": [{"page": 1}]}, {"slide": 2, "text": "Reliable answers cite supplied learning material and refuse unsupported claims.", "citations": [{"page": 1}]}, {"slide": 3, "text": "Source metadata makes the answer traceable.", "citations": [{"page": 1}]}]}'::jsonb,
   '{"week": 1, "title": "Evidence and Sources", "slides": [{"slide": 2, "heading": "Evidence and Sources — point 1", "bullets": ["Reliable answers cite supplied learning material and refuse unsupported claims."], "page": 1}, {"slide": 3, "heading": "Evidence and Sources — point 2", "bullets": ["Source metadata makes the answer traceable."], "page": 1}]}'::jsonb,
   '{"week": 1, "title": "Evidence and Sources", "questions": [{"prompt": "What makes an answer traceable?", "type": "mcq", "options": ["A) Source metadata", "B) Guessing", "C) Hiding mode", "D) Removing ownership"], "correct_option": "A", "source": "lecture"}]}'::jsonb),
  ('00000000-0000-4000-8000-000000004212', 4200, 'S-2026-000042', 2, 'Tenant Isolation',
   '{"title": "Tenant Isolation", "intro": "Each learner owns a separate data namespace.", "durationMinutes": 45, "slides": [{"heading": "Tenant Isolation — point 1", "bullets": ["Every query filters by the authenticated learner identifier."], "page": 2, "narration": "Every query filters by the authenticated learner identifier."}, {"heading": "Tenant Isolation — point 2", "bullets": ["A second learner cannot list or retrieve the first learner''s records."], "page": 2, "narration": "A second learner cannot list or retrieve the first learner''s records."}]}'::jsonb,
   '{"title": "Tenant Isolation", "durationMinutes": 45, "segments": [{"slide": 1, "text": "Each learner owns a separate data namespace.", "citations": [{"page": 2}]}, {"slide": 2, "text": "Every query filters by the authenticated learner identifier.", "citations": [{"page": 2}]}, {"slide": 3, "text": "A second learner cannot list or retrieve the first learner''s records.", "citations": [{"page": 2}]}]}'::jsonb,
   '{"week": 2, "title": "Tenant Isolation", "slides": [{"slide": 2, "heading": "Tenant Isolation — point 1", "bullets": ["Every query filters by the authenticated learner identifier."], "page": 2}, {"slide": 3, "heading": "Tenant Isolation — point 2", "bullets": ["A second learner cannot list or retrieve the first learner''s records."], "page": 2}]}'::jsonb,
   '{"week": 2, "title": "Tenant Isolation", "questions": [{"prompt": "What scopes a learner query?", "type": "mcq", "options": ["A) Authenticated learner ID", "B) Browser color", "C) Random port", "D) Model size"], "correct_option": "A", "source": "lecture"}]}'::jsonb),
  ('00000000-0000-4000-8000-000000004213', 4200, 'S-2026-000042', 3, 'Explicit Runtime Modes',
   '{"title": "Explicit Runtime Modes", "intro": "Standalone and integrated modes are selected explicitly.", "durationMinutes": 45, "slides": [{"heading": "Explicit Runtime Modes — point 1", "bullets": ["Missing services never silently activate fixture providers."], "page": 3, "narration": "Missing services never silently activate fixture providers."}, {"heading": "Explicit Runtime Modes — point 2", "bullets": ["Production rejects standalone-only routes and data."], "page": 3, "narration": "Production rejects standalone-only routes and data."}]}'::jsonb,
   '{"title": "Explicit Runtime Modes", "durationMinutes": 45, "segments": [{"slide": 1, "text": "Standalone and integrated modes are selected explicitly.", "citations": [{"page": 3}]}, {"slide": 2, "text": "Missing services never silently activate fixture providers.", "citations": [{"page": 3}]}, {"slide": 3, "text": "Production rejects standalone-only routes and data.", "citations": [{"page": 3}]}]}'::jsonb,
   '{"week": 3, "title": "Explicit Runtime Modes", "slides": [{"slide": 2, "heading": "Explicit Runtime Modes — point 1", "bullets": ["Missing services never silently activate fixture providers."], "page": 3}, {"slide": 3, "heading": "Explicit Runtime Modes — point 2", "bullets": ["Production rejects standalone-only routes and data."], "page": 3}]}'::jsonb,
   '{"week": 3, "title": "Explicit Runtime Modes", "questions": [{"prompt": "When should fixtures activate?", "type": "mcq", "options": ["A) Only explicit standalone mode", "B) Any network error", "C) Production", "D) Missing secrets"], "correct_option": "A", "source": "lecture"}]}'::jsonb),
  ('00000000-0000-4000-8000-000000004214', 4200, 'S-2026-000042', 4, 'Stable Contracts',
   '{"title": "Stable Contracts", "intro": "Shared contracts keep repository boundaries compatible.", "durationMinutes": 45, "slides": [{"heading": "Stable Contracts — point 1", "bullets": ["Lecture messages preserve their type and state vocabulary."], "page": 4, "narration": "Lecture messages preserve their type and state vocabulary."}, {"heading": "Stable Contracts — point 2", "bullets": ["Exam automation reports evidence and policy state, not guilt."], "page": 4, "narration": "Exam automation reports evidence and policy state, not guilt."}]}'::jsonb,
   '{"title": "Stable Contracts", "durationMinutes": 45, "segments": [{"slide": 1, "text": "Shared contracts keep repository boundaries compatible.", "citations": [{"page": 4}]}, {"slide": 2, "text": "Lecture messages preserve their type and state vocabulary.", "citations": [{"page": 4}]}, {"slide": 3, "text": "Exam automation reports evidence and policy state, not guilt.", "citations": [{"page": 4}]}]}'::jsonb,
   '{"week": 4, "title": "Stable Contracts", "slides": [{"slide": 2, "heading": "Stable Contracts — point 1", "bullets": ["Lecture messages preserve their type and state vocabulary."], "page": 4}, {"slide": 3, "heading": "Stable Contracts — point 2", "bullets": ["Exam automation reports evidence and policy state, not guilt."], "page": 4}]}'::jsonb,
   '{"week": 4, "title": "Stable Contracts", "questions": [{"prompt": "What does proctoring automation report?", "type": "mcq", "options": ["A) Evidence and policy state", "B) Automatic guilt", "C) Private video", "D) Unscoped data"], "correct_option": "A", "source": "lecture"}]}'::jsonb);

-- Point each seeded lecture at its artifact, the way generation does.
UPDATE lectures l
   SET lecture_artifact_id = la.artifact_id
  FROM lecture_artifacts la
 WHERE la.student_id = l.student_id AND la.week = l.week
   AND l.student_id = 'S-2026-000042';

INSERT INTO qa_log(
  id, lecture_id, question, answer, citations, model_used, asked_at, student_id, trace_id
) VALUES (
  4201,
  4211,
  'What protects each learner''s material?',
  'Tenant filtering keeps each learner''s material separate.',
  '[{"page":2,"excerpt":"Tenant filtering keeps each learner''s records separate."}]',
  'standalone-fixture',
  '2026-07-28T10:30:00Z',
  'S-2026-000042',
  'standalone-qa-4201-v1'
);
SELECT setval(
  pg_get_serial_sequence('qa_log', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM qa_log), 1),
  true
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
