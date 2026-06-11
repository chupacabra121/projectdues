# ChapterOS

Budgeting and financial forecasting for fraternities and student organizations.

ChapterOS is **not** accounting software. There are no ledgers, receipts, or
reimbursements. It is a planning tool built to answer one question for chapter
treasurers:

> "Can my chapter afford what we're planning this semester?"

## What's in V1

- **Onboarding wizard** — import a roster (CSV/XLSX with automatic member/pledge
  detection) or start from scratch with just headcounts, then set dues and an
  expected collection rate. Revenue is forecast live as you type.
- **Budget** — two lists that match how treasurers actually think: *Fixed
  Obligations* (things we must pay: national fees, rent, insurance) and
  *Planned Events* (things we want to do: formal, rush, retreats). Events are
  auto-categorized (Social, Recruitment, Brotherhood, …) with manual override.
  Obligations support one-time, monthly, and yearly frequencies.
- **Forecasting** — projected revenue, total obligations, total planned events,
  and projected end-of-semester balance, recomputed on every change.
- **Scenario planning** — conservative / expected / optimistic pledge-class
  sizes, each with its own full forecast.
- **Dashboard** — financial health cards, budget status bars, a timeline of
  upcoming commitments, and plain-English treasurer insights ("Recruiting 5
  additional pledges would eliminate the projected deficit").

## Stack

- Next.js (App Router) + React + TypeScript + Tailwind CSS
- SQLite via better-sqlite3 (file lives in `data/`, created automatically)
- Cookie-session auth (jose JWT + bcryptjs)
- papaparse / xlsx for client-side roster parsing

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, create an account, and walk through onboarding.

Set `SESSION_SECRET` in production; a dev fallback is used otherwise.
