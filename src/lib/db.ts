import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

declare global {
  // eslint-disable-next-line no-var
  var __chapterosDb: Database.Database | undefined;
}

function createDb(): Database.Database {
  const db = new Database(path.join(DATA_DIR, "chapteros.db"));
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
      type TEXT NOT NULL CHECK (type IN ('fixed_expense', 'planned_event')),
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
  `);
  return db;
}

export function getDb(): Database.Database {
  if (!global.__chapterosDb) global.__chapterosDb = createDb();
  return global.__chapterosDb;
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  chapter_name: string;
}

export interface SettingsRow {
  user_id: number;
  onboarded: number;
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
  semester_start: string;
  semester_end: string;
}

export interface BudgetItemRow {
  id: number;
  user_id: number;
  type: "fixed_expense" | "planned_event";
  name: string;
  amount: number;
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

export function getBudgetItems(userId: number): BudgetItemRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM budget_items WHERE user_id = ? ORDER BY date IS NULL, date ASC, id ASC"
    )
    .all(userId) as BudgetItemRow[];
}
