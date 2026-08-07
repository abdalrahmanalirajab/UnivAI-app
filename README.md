# UnivAI-app — the Face (port 3100)

## Standalone development

Standalone mode keeps the real Next.js application, PostgreSQL, Better Auth,
signed session cookie, tenant-scoped queries, virtual clock, pages, and API
guards. It replaces only Agent/RAG generation, Exam, and LiveKit with explicit
deterministic adapters.

```powershell
npm install
npm run dev:standalone
```

Open `http://localhost:3100/login` and sign in normally with:

- Email: `learner@univai.local`
- Password: `LearnLocal123!`

The account is created through Better Auth's public signup API, then marked
verified in the isolated local database. It is not an authentication bypass.
PostgreSQL runs on `127.0.0.1:5434` in `univai_app_standalone`.

Useful commands are `npm run standalone:seed`, `npm run standalone:reset`,
`npm run standalone:down`, `npm run smoke:standalone`, `npm test`,
`npm run lint`, and `npm run build`.

The idempotent seed contains one learner, a project-authored book, four weekly
lectures, attendance/progress, a grade, deterministic Exam states, and a local
lecture simulation. `/api/health` reports database and adapter readiness.
`/dev/scenarios` lists the supported `UNIVAI_SCENARIO` values.

The standalone upload path still checks PDF extension, size, and `%PDF-` magic
bytes, but does not store uploaded content, start Python, call MCP, or download
a model. The lecture simulator uses the App-visible message/state vocabulary
with silent audio and scripted transcripts.

Standalone adapters require `UNIVAI_MODE=standalone` and are rejected in
production. No real key, book, transcript, or user data is committed.

## Integrated mode

`npm run dev` under the main UnivAI checkout remains integrated mode. Set
`UNIVAI_INTEGRATION_ROOT` only for a non-standard composition path; otherwise
the validated parent fallback remains. Integrated mode keeps Agent MCP,
generator subprocess, shared lectures, Exam Mongo/HTTP, and LiveKit contracts.

This directory is a Git submodule. Merge App changes here first, then update
the main UnivAI gitlink. Local submodule changes are not automatically
included in a main-repository commit.

Every page, every API route, and all integration glue for UnivAI: dashboard,
auth flows, exam callbacks, LiveKit tokens, course upload, and the virtual
clock. Frontend is **pure MUI**: no `sx`, no `styled()`, no CSS files.

```bash
npx next dev -p 3100      # or: make app  (from the parent repo)
```

## Find what you're looking for

| You want | Look in |
|---|---|
| a page | `app/<route>/page.tsx` — `/upload`, `/schedule`, `/lecture/[id]`, `/exams`, `/dashboard`, `/admin` |
| an API route | `app/api/<name>/route.ts` — clock, upload, admin (state / generate / restart), exams (start / callback), dashboard |
| the live-lecture room UI | `app/lecture/[id]/LectureRoom.tsx` — LiveKit room, slide iframe, raise-hand steppers |
| business logic | `lib/` — one file per concern (see below) |

## lib/ — one file per concern

| File | Owns |
|---|---|
| `clock.ts` | the virtual clock — the ONLY wall-clock read on the TS side |
| `db.ts` | Postgres (`:5433`) |
| `lectures.ts` | the 4-week schedule, join windows, reschedule |
| `attendance.ts` | on-time / late / absent, derived from the clock |
| `exams.ts` | exam-system integration: seeding its world, question-bank sync, windows, starting exams |
| `course-size.ts` | the XS–XL assessment-paper sizes used by the Exam integration |
| `generation.ts` | spawns the course builder detached |
| `python.ts` | how TS shells out to the venv's Python |
| `settings.ts` | the key/value admin settings table |
| `env.ts`, `time.ts` | env access, time formatting |

The lecture room embeds a real Slidev deck. Its canonical slide content comes
from PostgreSQL; generation compiles only a disposable `.cache/slidev/<uuid>/`
render and the authenticated presentation API serves it.
