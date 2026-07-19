# UnivAI-app — the Face (port 3100)

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
| `course-size.ts` | the XS–XL dial (mirror of the generator's SIZES — keep in sync) |
| `generation.ts` | spawns the course builder detached |
| `python.ts` | how TS shells out to the venv's Python |
| `settings.ts` | the key/value admin settings table |
| `env.ts`, `time.ts` | env access, time formatting |

Slidev decks are served static from `public/slides/week-N/`
(built by `scripts/build-slides.mjs`).
