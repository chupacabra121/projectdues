import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { ActiveDuesBreakdown } from "./forecast";
import { MemberStatus } from "./memberStatus";
import {
  DuesPlan,
  DEFAULT_DUES_PLANS,
  memberEffectiveDues,
} from "./memberDues";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

declare global {
  var __simpleduesDb: Database.Database | undefined;
}

function createDb(): Database.Database {
  const db = new Database(path.join(DATA_DIR, "simpledues.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      chapter_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      onboarded INTEGER NOT NULL DEFAULT 0,
      active_members INTEGER NOT NULL DEFAULT 0,
      current_pledges INTEGER NOT NULL DEFAULT 0,
      pledges_conservative INTEGER NOT NULL DEFAULT 0,
      pledges_expected INTEGER NOT NULL DEFAULT 0,
      pledges_optimistic INTEGER NOT NULL DEFAULT 0,
      active_dues REAL NOT NULL DEFAULT 0,
      pledge_dues REAL NOT NULL DEFAULT 0,
      collection_rate REAL NOT NULL DEFAULT 0.95,
      starting_balance REAL NOT NULL DEFAULT 0,
      dues_collected REAL NOT NULL DEFAULT 0,
      reserve_target REAL NOT NULL DEFAULT 0,
      semester_start TEXT NOT NULL DEFAULT '',
      semester_end TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS budget_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL CHECK (type IN ('fixed_expense', 'planned_event', 'other_income')),
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT,
      frequency TEXT NOT NULL DEFAULT 'one_time' CHECK (frequency IN ('one_time', 'monthly', 'yearly')),
      category TEXT NOT NULL DEFAULT '',
      attendance INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_budget_items_user ON budget_items(user_id);

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pledge', 'alumni', 'inactive')),
      aid_plan INTEGER,
      aid_amount REAL,
      dues_paid INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);

    CREATE TABLE IF NOT EXISTS category_caps (
      user_id INTEGER NOT NULL REFERENCES users(id),
      period_id INTEGER NOT NULL REFERENCES periods(id),
      category TEXT NOT NULL,
      cap REAL NOT NULL,
      PRIMARY KEY (user_id, period_id, category)
    );

    CREATE TABLE IF NOT EXISTS periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      semester_start TEXT NOT NULL,
      semester_end TEXT NOT NULL,
      active_members INTEGER NOT NULL DEFAULT 0,
      current_pledges INTEGER NOT NULL DEFAULT 0,
      pledges_conservative INTEGER NOT NULL DEFAULT 0,
      pledges_expected INTEGER NOT NULL DEFAULT 0,
      pledges_optimistic INTEGER NOT NULL DEFAULT 0,
      active_dues REAL NOT NULL DEFAULT 0,
      pledge_dues REAL NOT NULL DEFAULT 0,
      collection_rate REAL NOT NULL DEFAULT 0.95,
      starting_balance REAL NOT NULL DEFAULT 0,
      dues_collected REAL NOT NULL DEFAULT 0,
      reserve_target REAL NOT NULL DEFAULT 0,
      dues_schedule TEXT NOT NULL DEFAULT 'sixweek',
      active_dues_breakdown TEXT,
      dues_plans TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_periods_user ON periods(user_id);
  `);
  migrateBudgetItemTypes(db);
  migrateMemberStatuses(db);
  addColumnIfMissing(db, "budget_items", "actual_amount", "REAL");
  addColumnIfMissing(db, "settings", "dues_schedule", "TEXT NOT NULL DEFAULT 'sixweek'");
  addColumnIfMissing(db, "settings", "active_period_id", "INTEGER");
  addColumnIfMissing(db, "budget_items", "period_id", "INTEGER");
  addColumnIfMissing(db, "members", "period_id", "INTEGER");
  addColumnIfMissing(db, "members", "aid_plan", "INTEGER");
  addColumnIfMissing(db, "members", "aid_amount", "REAL");
  addColumnIfMissing(db, "members", "dues_paid", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "periods", "active_dues_breakdown", "TEXT");
  addColumnIfMissing(db, "periods", "dues_plans", "TEXT");
  migrateToPeriods(db);
  return db;
}

/** Parse the stored active-dues breakdown JSON into a typed value (or null). */
export function parseActiveDuesBreakdown(
  raw: unknown
): ActiveDuesBreakdown | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.aid)) return null;
    return {
      fullCount: Math.max(0, Math.round(Number(p.fullCount) || 0)),
      fullRate: Math.max(0, Number(p.fullRate) || 0),
      aid: p.aid.map((a: { name?: unknown; amount?: unknown }) => ({
        name: String(a?.name ?? "").slice(0, 80),
        amount: Math.max(0, Number(a?.amount) || 0),
      })),
    };
  } catch {
    return null;
  }
}

/** Parse the stored financial-aid plans JSON, falling back to the defaults. */
export function parseDuesPlans(raw: unknown): DuesPlan[] {
  if (typeof raw !== "string" || !raw) return DEFAULT_DUES_PLANS;
  try {
    const p = JSON.parse(raw);
    if (!Array.isArray(p) || p.length === 0) return DEFAULT_DUES_PLANS;
    return p.slice(0, 4).map((d: { name?: unknown; amount?: unknown }) => ({
      name: String(d?.name ?? "").slice(0, 40) || "Plan",
      amount: Math.max(0, Number(d?.amount) || 0),
    }));
  } catch {
    return DEFAULT_DUES_PLANS;
  }
}

/** Hydrate a raw periods row: parse the breakdown + plans JSON into typed fields. */
function hydratePeriod(row: Record<string, unknown>): PeriodRow {
  return {
    ...(row as unknown as PeriodRow),
    active_dues_breakdown: parseActiveDuesBreakdown(row.active_dues_breakdown),
    dues_plans: parseDuesPlans(row.dues_plans),
  };
}

/** Auto-name a period from its start date: "Spring 2026", "Fall 2026", … */
export function periodNameFor(startIso: string): string {
  const m = Number(startIso.slice(5, 7));
  const y = startIso.slice(0, 4);
  if (m >= 8) return `Fall ${y}`;
  if (m >= 6) return `Summer ${y}`;
  return `Spring ${y}`;
}

/**
 * One-time move from the single-semester world: every onboarded user's
 * settings row becomes their first period, and their items/members/caps get
 * tagged with it. Also rebuilds category_caps to be period-scoped.
 */
function migrateToPeriods(db: Database.Database) {
  // Rebuild category_caps with a period_id column if it predates periods.
  const capCols = db.prepare("PRAGMA table_info(category_caps)").all() as {
    name: string;
  }[];
  const capsNeedRebuild = !capCols.some((c) => c.name === "period_id");

  const legacy = db
    .prepare(
      `SELECT * FROM settings WHERE onboarded = 1 AND active_period_id IS NULL`
    )
    .all() as (SettingsRow & {
    active_members: number;
    current_pledges: number;
    pledges_conservative: number;
    pledges_expected: number;
    pledges_optimistic: number;
    active_dues: number;
    pledge_dues: number;
    collection_rate: number;
    starting_balance: number;
    dues_collected: number;
    reserve_target: number;
    dues_schedule: string;
    semester_start: string;
    semester_end: string;
  })[];

  // Everything below runs in ONE transaction so an interrupted migration
  // rolls back cleanly and the next startup retries from scratch. The
  // DROP IF EXISTS clears any category_caps_new left by a prior crashed run.
  const run = db.transaction(() => {
    if (capsNeedRebuild) {
      db.exec(`
        DROP TABLE IF EXISTS category_caps_new;
        CREATE TABLE category_caps_new (
          user_id INTEGER NOT NULL REFERENCES users(id),
          period_id INTEGER NOT NULL REFERENCES periods(id),
          category TEXT NOT NULL,
          cap REAL NOT NULL,
          PRIMARY KEY (user_id, period_id, category)
        );
      `);
    }
    for (const s of legacy) {
      const start = s.semester_start || defaultSemester().start;
      const end = s.semester_end || defaultSemester().end;
      const pid = db
        .prepare(
          `INSERT INTO periods (
            user_id, name, semester_start, semester_end,
            active_members, current_pledges,
            pledges_conservative, pledges_expected, pledges_optimistic,
            active_dues, pledge_dues, collection_rate,
            starting_balance, dues_collected, reserve_target, dues_schedule
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          s.user_id,
          periodNameFor(start),
          start,
          end,
          s.active_members,
          s.current_pledges,
          s.pledges_conservative,
          s.pledges_expected,
          s.pledges_optimistic,
          s.active_dues,
          s.pledge_dues,
          s.collection_rate,
          s.starting_balance,
          s.dues_collected,
          s.reserve_target,
          s.dues_schedule || "sixweek"
        ).lastInsertRowid;
      db.prepare(
        "UPDATE settings SET active_period_id = ? WHERE user_id = ?"
      ).run(pid, s.user_id);
      db.prepare(
        "UPDATE budget_items SET period_id = ? WHERE user_id = ? AND period_id IS NULL"
      ).run(pid, s.user_id);
      db.prepare(
        "UPDATE members SET period_id = ? WHERE user_id = ? AND period_id IS NULL"
      ).run(pid, s.user_id);
      if (capsNeedRebuild) {
        db.prepare(
          `INSERT INTO category_caps_new (user_id, period_id, category, cap)
           SELECT user_id, ?, category, cap FROM category_caps WHERE user_id = ?`
        ).run(pid, s.user_id);
      }
    }
    if (capsNeedRebuild) {
      db.exec(
        "DROP TABLE category_caps; ALTER TABLE category_caps_new RENAME TO category_caps;"
      );
    }
  });
  run();
}

/** ALTER TABLE ADD COLUMN guard for upgrading existing local databases. */
function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  decl: string
) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

/** Older databases restricted budget_items.type to expense/event; SQLite can't
 * alter CHECK constraints, so rebuild the table when other_income is missing. */
function migrateBudgetItemTypes(db: Database.Database) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='budget_items'")
    .get() as { sql: string } | undefined;
  if (!row || row.sql.includes("other_income")) return;
  db.exec(`
    BEGIN;
    CREATE TABLE budget_items_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL CHECK (type IN ('fixed_expense', 'planned_event', 'other_income')),
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT,
      frequency TEXT NOT NULL DEFAULT 'one_time' CHECK (frequency IN ('one_time', 'monthly', 'yearly')),
      category TEXT NOT NULL DEFAULT '',
      attendance INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO budget_items_new SELECT * FROM budget_items;
    DROP TABLE budget_items;
    ALTER TABLE budget_items_new RENAME TO budget_items;
    CREATE INDEX IF NOT EXISTS idx_budget_items_user ON budget_items(user_id);
    COMMIT;
  `);
}

/** Members used to be active/pledge only and carried an amount_paid column.
 * Dues now live entirely on the budget, so rebuild the table to widen the
 * status set (alumni/inactive) and drop amount_paid. SQLite can't alter a
 * CHECK constraint or drop a column in place on older versions, so recreate. */
function migrateMemberStatuses(db: Database.Database) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='members'")
    .get() as { sql: string } | undefined;
  if (!row) return;
  const migrated =
    row.sql.includes("'alumni'") && !row.sql.includes("amount_paid");
  if (migrated) return;
  const hasPeriod = (
    db.prepare("PRAGMA table_info(members)").all() as { name: string }[]
  ).some((c) => c.name === "period_id");
  db.exec(`
    BEGIN;
    CREATE TABLE members_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pledge', 'alumni', 'inactive')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      period_id INTEGER
    );
    INSERT INTO members_new (id, user_id, name, email, phone, status, created_at, period_id)
      SELECT id, user_id, name, email, phone, status, created_at, ${
        hasPeriod ? "period_id" : "NULL"
      } FROM members;
    DROP TABLE members;
    ALTER TABLE members_new RENAME TO members;
    CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
    COMMIT;
  `);
}

export function getDb(): Database.Database {
  if (!global.__simpleduesDb) global.__simpleduesDb = createDb();
  return global.__simpleduesDb;
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  chapter_name: string;
}

/** User-level settings; per-semester numbers live on PeriodRow now. */
export interface SettingsRow {
  user_id: number;
  onboarded: number;
  active_period_id: number | null;
}

/** A budgeting time period (semester): its calendar plus all budget inputs. */
export interface PeriodRow {
  id: number;
  user_id: number;
  name: string;
  semester_start: string;
  semester_end: string;
  active_members: number;
  current_pledges: number;
  pledges_conservative: number;
  pledges_expected: number;
  pledges_optimistic: number;
  active_dues: number;
  pledge_dues: number;
  collection_rate: number;
  starting_balance: number;
  dues_collected: number;
  reserve_target: number;
  dues_schedule: string;
  /** Parsed by the getters; null = flat active_members × active_dues. */
  active_dues_breakdown: ActiveDuesBreakdown | null;
  /** Financial-aid plans (name + preset amount); parsed by the getters. */
  dues_plans: DuesPlan[];
}

export interface BudgetItemRow {
  id: number;
  user_id: number;
  type: "fixed_expense" | "planned_event" | "other_income";
  name: string;
  amount: number;
  actual_amount: number | null;
  date: string | null;
  frequency: "one_time" | "monthly" | "yearly";
  category: string;
  attendance: number | null;
  notes: string;
}

/** Default semester window based on today's date (fall: Aug–Dec, spring: Jan–May). */
export function defaultSemester(today = new Date()): { start: string; end: string } {
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-based
  if (m >= 6) {
    // July onward -> fall semester
    return { start: `${y}-08-15`, end: `${y}-12-20` };
  }
  return { start: `${y}-01-10`, end: `${y}-05-15` };
}

export function getSettings(userId: number): SettingsRow | undefined {
  return getDb()
    .prepare("SELECT * FROM settings WHERE user_id = ?")
    .get(userId) as SettingsRow | undefined;
}

export interface MemberRow {
  id: number;
  user_id: number;
  name: string;
  email: string;
  phone: string;
  status: MemberStatus;
  /** Financial-aid plan index into the period's dues_plans, or null = set rate. */
  aid_plan: number | null;
  /** Individual override of the plan's preset amount, or null = use the preset. */
  aid_amount: number | null;
  /** 1 once the member has paid their dues (the Dues-tab checkbox). */
  dues_paid: number;
}

export function getMembers(userId: number, periodId: number): MemberRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM members WHERE user_id = ? AND period_id = ? ORDER BY status ASC, name COLLATE NOCASE ASC"
    )
    .all(userId, periodId) as MemberRow[];
}

/**
 * Roster → budget: materialize the period's derived dues fields so the forecast
 * (which reads period fields) reflects the roster and the per-member paid
 * checkboxes. Sets:
 *  - active_members + active_dues_breakdown (full-dues tier + individually
 *    priced members: anyone on a plan or with an override).
 *  - dues_collected = Σ effective dues of every member (active OR pledge) marked
 *    paid — the single source of "collected to date".
 * Call after any change to the roster, a member's dues/plan/amount, the paid
 * checkboxes, the set rates, or the plan amounts.
 */
export function recomputeDerivedDues(userId: number, periodId: number): void {
  const db = getDb();
  const period = db
    .prepare(
      "SELECT active_dues, pledge_dues, dues_plans FROM periods WHERE id = ? AND user_id = ?"
    )
    .get(periodId, userId) as
    | { active_dues: number; pledge_dues: number; dues_plans: unknown }
    | undefined;
  if (!period) return;
  const plans = parseDuesPlans(period.dues_plans);
  const activeRate = Math.max(0, Number(period.active_dues) || 0);
  const pledgeRate = Math.max(0, Number(period.pledge_dues) || 0);
  const members = db
    .prepare(
      "SELECT name, status, aid_plan, aid_amount, dues_paid FROM members WHERE user_id = ? AND period_id = ? AND status IN ('active','pledge')"
    )
    .all(userId, periodId) as {
    name: string;
    status: string;
    aid_plan: number | null;
    aid_amount: number | null;
    dues_paid: number;
  }[];

  const duesOf = (m: { status: string; aid_plan: number | null; aid_amount: number | null }) =>
    memberEffectiveDues(
      m.aid_plan,
      m.aid_amount,
      plans,
      m.status === "active" ? activeRate : pledgeRate
    );

  // Active-dues breakdown: anyone with a plan or an override is priced
  // individually; the rest pay the flat rate (fullCount × fullRate).
  const actives = members.filter((m) => m.status === "active");
  const aid = actives
    .filter((m) => m.aid_plan != null || m.aid_amount != null)
    .map((m) => ({
      name: m.name,
      amount: memberEffectiveDues(m.aid_plan, m.aid_amount, plans, activeRate),
    }));
  const breakdown = { fullCount: actives.length - aid.length, fullRate: activeRate, aid };

  // Collected = the dues of everyone checked off (actives and pledges alike).
  const collected = members
    .filter((m) => m.dues_paid === 1)
    .reduce((sum, m) => sum + duesOf(m), 0);

  db.prepare(
    "UPDATE periods SET active_members = ?, active_dues_breakdown = ?, dues_collected = ? WHERE id = ? AND user_id = ?"
  ).run(actives.length, JSON.stringify(breakdown), collected, periodId, userId);
}

export function getPeriods(userId: number): PeriodRow[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM periods WHERE user_id = ? ORDER BY semester_start DESC, id DESC"
    )
    .all(userId) as Record<string, unknown>[];
  return rows.map(hydratePeriod);
}

/** The period the treasurer is working in — falls back to the most recent. */
export function getActivePeriod(userId: number): PeriodRow | undefined {
  const settings = getSettings(userId);
  if (settings?.active_period_id != null) {
    const p = getDb()
      .prepare("SELECT * FROM periods WHERE id = ? AND user_id = ?")
      .get(settings.active_period_id, userId) as Record<string, unknown> | undefined;
    if (p) return hydratePeriod(p);
  }
  return getPeriods(userId)[0];
}

export function getCategoryCaps(
  userId: number,
  periodId: number
): Record<string, number> {
  const rows = getDb()
    .prepare(
      "SELECT category, cap FROM category_caps WHERE user_id = ? AND period_id = ?"
    )
    .all(userId, periodId) as { category: string; cap: number }[];
  return Object.fromEntries(rows.map((r) => [r.category, r.cap]));
}

export function getBudgetItems(userId: number, periodId: number): BudgetItemRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM budget_items WHERE user_id = ? AND period_id = ? ORDER BY date IS NULL, date ASC, id ASC"
    )
    .all(userId, periodId) as BudgetItemRow[];
}
