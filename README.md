# SimpleDues

Dues, budgets, and forecasts made simple for fraternities and student organizations.

SimpleDues is **not** accounting software. There are no ledgers, receipts, or
reimbursements. It is a planning tool built to answer one question for chapter
treasurers:

> "Can my chapter afford what we're planning this semester?"

## How it's organized

Every page shares a two-row header: the main tabs up top (Dashboard,
Budget, Members, Scenarios) with the **agent team strip right below** — four
AI-generated teammates with photos; tap one to step into their office.
**Penny (Budgeting)** runs the main tabs and signs the dashboard's next-action
card. **Dunn (Dues Collection — mass email/SMS reminders)**, **Russ
(Recruitment)**, and **Evie (Events)** have office pages with their planned
workspaces, unlocking as they ship. The first page after login is the general
dashboard: a time-aware greeting, key numbers, Penny's next action, and the
full semester forecast. Agent portraits are AI-generated (StyleGAN2 via
thispersondoesnotexist.com); the visual language (warm near-white surfaces,
one emerald accent, serif display headings, pill navigation) is inspired by
finia.ro.

## What's in V1

- **Dashboard home** — greeting, impact tiles, and a "next action" card
  signed by Penny, computed from your live forecast (deficit → review budget;
  unpaid dues → open the roster), above the full semester overview.
- **Onboarding wizard** — import a roster (CSV/XLSX with automatic detection
  of status, name, email, and phone columns; alumni/inactive rows are
  skipped) or start from scratch with just headcounts, then set dues and an
  expected collection rate. Revenue is forecast live as you type.
- **Budget workbench** — everything on one tab. A *Money In* panel holds
  membership, dues, collection rate, all three pledge-class scenarios,
  balances, reserve target, and the semester window — with debounced
  auto-save and the forecast recalculating live as you type, plus an *Other
  Income* list for fundraisers, donations, and allocations. *Fixed
  Obligations* (things we must pay) and *Planned Events* (things we want to
  do) sit below, with inline click-to-edit on every item. Items are
  auto-categorized with manual override; obligations support one-time,
  monthly, and yearly frequencies.
- **Members roster** — every member with email, phone, status, and dues
  balance. Inline editing, one-click "mark paid", filters (all / actives /
  pledges / unpaid), and filter-aware copy-emails / copy-phones buttons — the
  foundation for mass email and SMS dues reminders (coming later). Roster
  imports bring contact info in automatically, and a one-click sync pushes
  roster headcounts and collected dues into the budget.
- **Forecasting** — projected revenue, total obligations, total planned events,
  and projected end-of-semester balance, recomputed on every change. Items
  take an **actual cost** once known (variance vs plan tracked everywhere),
  categories take **allocation caps** (the no-committee-overspends rule), and
  the cash curve follows your **dues schedule** (six-week ramp, upfront,
  monthly installments, or thirds). The dashboard adds a "where a member's
  dues go" transparency card and rainy-day reserve guidance (~5% of dues).
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
