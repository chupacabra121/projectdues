import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

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
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pledge')),
      amount_paid REAL NOT NULL DEFAULT 0,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_periods_user ON periods(user_id);
  `);
  migrateBudgetItemTypes(db);
  addColumnIfMissing(db, "budget_items", "actual_amount", "REAL");
  addColumnIfMissing(db, "settings", "dues_schedule", "TEXT NOT NULL DEFAULT 'sixweek'");
  addColumnIfMissing(db, "settings", "active_period_id", "INTEGER");
  addColumnIfMissing(db, "budget_items", "period_id", "INTEGER");
  addColumnIfMissing(db, "members", "period_id", "INTEGER");
  migrateToPeriods(db);
  return db;
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
  status: "active" | "pledge";
  amount_paid: number;
}

export function getMembers(userId: number, periodId: number): MemberRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM members WHERE user_id = ? AND period_id = ? ORDER BY status ASC, name COLLATE NOCASE ASC"
    )
    .all(userId, periodId) as MemberRow[];
}

export function getPeriods(userId: number): PeriodRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM periods WHERE user_id = ? ORDER BY semester_start DESC, id DESC"
    )
    .all(userId) as PeriodRow[];
}

/** The period the treasurer is working in — falls back to the most recent. */
export function getActivePeriod(userId: number): PeriodRow | undefined {
  const settings = getSettings(userId);
  if (settings?.active_period_id != null) {
    const p = getDb()
      .prepare("SELECT * FROM periods WHERE id = ? AND user_id = ?")
      .get(settings.active_period_id, userId) as PeriodRow | undefined;
    if (p) return p;
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
