# UnivAI App — frontend prototype

The standalone frontend prototype of **UnivAI ("Jamieh")**: the first pass at
the student-facing pages (upload, schedule, lecture, evaluation) with the MUI
theme, built as its own Next.js app.

The integrated product lives in the main `UnivAI` repo (`app/`, port 3100);
this repo is where the UI ideas get tried first.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

## What's inside

| Folder | What |
|---|---|
| `app/upload/` | book upload page |
| `app/schedule/` | the weekly lecture schedule |
| `app/lecture/` | the lecture room UI |
| `app/evaluation/` | quizzes / results views |
| `app/components/` | shared building blocks |
| `app/theme.js` + `ThemeRegistry.js` | the MUI theme |
