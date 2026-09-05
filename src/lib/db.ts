import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
  ActiveDuesBreakdown,
  ScheduledPayment,
  ScheduleLine,
  TierBreakdown,
} from "./forecast";
import { MemberStatus } from "./memberStatus";
import { CollectionStage, ContactChannel } from "./collectionStages";
import {
  DuesPlan,
  DEFAULT_DUES_PLANS,
  memberEffectiveDues,
  memberSetRate,
  memberTier,
  hasRepricingTag,
  CustomCategory,
  DuesRule,
  CATEGORY_COLOR_TOKENS,
  MAX_CUSTOM_CATEGORIES,
} from "./memberDues";

// The database lives at DATABASE_PATH when set — point this at a mounted
// persistent volume in production (e.g. /data/simpledues.db on Railway) so a
// redeploy can't wipe it. Defaults to ./data for local development.
const DB_PATH =
  process.env.DATABASE_PATH ??
  path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "simpledues.db");
const DATA_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

declare global {
  var __simpleduesDb: Database.Database | undefined;
}

/**
 * Snapshot the existing database before this process opens it, so a bad
 * migration or a corrupted write is always recoverable. Backups sit next to the
 * DB (same volume) under backups/, newest ~10 kept. Taken before the connection
 * opens — no other writer is active then, so main + WAL + SHM copy as one
 * consistent set. A failure here must never stop the app from starting.
 */
function backupDatabase(): void {
  if (!fs.existsSync(DB_PATH)) return; // first run — nothing to back up yet
  try {
    const backupsDir = path.join(DATA_DIR, "backups");
    fs.mkdirSync(backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = path.basename(DB_PATH);
    for (const suffix of ["", "-wal", "-shm"]) {
      const src = DB_PATH + suffix;
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(backupsDir, `${base}.${stamp}${suffix}`));
      }
    }
    // Retain the newest ~10 snapshots; drop older sets (main file + companions).
    const snaps = fs
      .readdirSync(backupsDir)
      .filter(
        (f) =>
          f.startsWith(`${base}.`) && !f.endsWith("-wal") && !f.endsWith("-shm")
      )
      .sort();
    for (const old of snaps.slice(0, Math.max(0, snaps.length - 10))) {
      for (const suffix of ["", "-wal", "-shm"]) {
        const f = path.join(backupsDir, old + suffix);
        if (fs.existsSync(f)) fs.rmSync(f);
      }
    }
  } catch (err) {
    console.error("[db] backup before migrations failed (continuing):", err);
  }
}

function createDb(): Database.Database {
  backupDatabase();
  const db = new Database(DB_PATH);
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
      type TEXT NOT NULL CHECK (type IN ('fixed_expense', 'planned_event', 'other_income', 'variable_expense')),
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT,
      frequency TEXT NOT NULL DEFAULT 'one_time' CHECK (frequency IN ('one_time', 'monthly', 'yearly')),
      category TEXT NOT NULL DEFAULT '',
      attendance INTEGER,
      cost_basis TEXT,
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
      status TEXT NOT NULL DEFAULT 'brother' CHECK (status IN ('brother', 'pledge', 'alumni', 'inactive', 'trash')),
      aid_plan INTEGER,
      aid_amount REAL,
      dues_paid INTEGER NOT NULL DEFAULT 0,
      collection_stage TEXT NOT NULL DEFAULT 'not_contacted',
      contact_count INTEGER NOT NULL DEFAULT 0,
      last_contacted_at TEXT,
      last_contact_channel TEXT,
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
      collection_payment_instructions TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_periods_user ON periods(user_id);

    CREATE TABLE IF NOT EXISTS collection_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      period_id INTEGER NOT NULL REFERENCES periods(id),
      member_id INTEGER NOT NULL REFERENCES members(id),
      channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'manual')),
      stage TEXT NOT NULL DEFAULT 'reminder_sent' CHECK (stage IN ('not_contacted', 'reminder_sent', 'follow_up', 'overdue', 'payment_plan', 'paid')),
      event_status TEXT NOT NULL DEFAULT 'logged' CHECK (event_status IN ('drafted', 'copied', 'logged', 'sent')),
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_collection_events_period ON collection_events(user_id, period_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_collection_events_member ON collection_events(member_id, created_at);
  `);
  migrateBudgetItemTypes(db);
  migrateMemberStatuses(db);
  migrateMemberBrotherStatus(db);
  addColumnIfMissing(db, "budget_items", "actual_amount", "REAL");
  addColumnIfMissing(db, "budget_items", "cost_basis", "TEXT");
  addColumnIfMissing(db, "budget_items", "paid", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "budget_items", "schedule", "TEXT");
  // Supporting schedule (units x rate build-up) behind an item's amount.
  addColumnIfMissing(db, "budget_items", "breakdown", "TEXT");
  addColumnIfMissing(db, "users", "first_name", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "users", "last_name", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "users", "phone", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "users", "title", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "users", "preferences", "TEXT");
  addColumnIfMissing(db, "members", "tags", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "periods", "custom_categories", "TEXT");
  addColumnIfMissing(db, "periods", "custom_tier_breakdowns", "TEXT");
  addColumnIfMissing(db, "settings", "dues_schedule", "TEXT NOT NULL DEFAULT 'sixweek'");
  addColumnIfMissing(db, "settings", "active_period_id", "INTEGER");
  addColumnIfMissing(db, "budget_items", "period_id", "INTEGER");
  addColumnIfMissing(db, "members", "period_id", "INTEGER");
  addColumnIfMissing(db, "members", "aid_plan", "INTEGER");
  addColumnIfMissing(db, "members", "aid_amount", "REAL");
  addColumnIfMissing(db, "members", "dues_paid", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "members", "collection_stage", "TEXT NOT NULL DEFAULT 'not_contacted'");
  addColumnIfMissing(db, "members", "contact_count", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "members", "last_contacted_at", "TEXT");
  addColumnIfMissing(db, "members", "last_contact_channel", "TEXT");
  addColumnIfMissing(db, "periods", "active_dues_breakdown", "TEXT");
  addColumnIfMissing(db, "periods", "dues_plans", "TEXT");
  addColumnIfMissing(db, "periods", "collection_payment_instructions", "TEXT NOT NULL DEFAULT ''");
  // Per-tier collection rates. Nullable on purpose: NULL means "not split yet",
  // and every reader falls back to the blended collection_rate, so periods
  // created before the split keep forecasting exactly as they did.
  addColumnIfMissing(db, "periods", "brother_collection_rate", "REAL");
  addColumnIfMissing(db, "periods", "pledge_collection_rate", "REAL");
  addColumnIfMissing(db, "settings", "brother_collection_rate", "REAL");
  addColumnIfMissing(db, "settings", "pledge_collection_rate", "REAL");
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

/**
 * Parse a budget item's payment schedule (deposit + balance) JSON. Returns null
 * — i.e. fall back to single-date behavior — unless every row has a valid date
 * and positive amount AND the parts reconcile to the planned total. Once a real
 * cost lands the stored total changes and the split is intentionally dropped,
 * so the curve uses the actual on the single date instead.
 */
/**
 * Parse an item's supporting schedule. Unlike `parseSchedule` this never has to
 * reconcile against a stored total — the total is DERIVED from these lines — so
 * a partially-filled row is kept rather than discarding the whole build-up.
 */
export function parseBreakdown(raw: unknown): ScheduleLine[] | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!Array.isArray(p) || p.length === 0) return null;
    const lines = p.slice(0, 40).map((r: Record<string, unknown>) => {
      const label = String(r?.label ?? "").slice(0, 80);
      if (r?.pct != null) {
        return { label, pct: Math.min(10, Math.max(0, Number(r.pct) || 0)) };
      }
      return {
        label,
        qty: Math.max(0, Number(r?.qty) || 0),
        rate: Math.max(0, Number(r?.rate) || 0),
      };
    });
    return lines.length ? lines : null;
  } catch {
    return null;
  }
}

export function parseSchedule(
  raw: unknown,
  totalAmount: number
): ScheduledPayment[] | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!Array.isArray(p) || p.length < 2) return null;
    const rows = p
      .slice(0, 6)
      .map((r: { amount?: unknown; date?: unknown }) => ({
        amount: Math.max(0, Number(r?.amount) || 0),
        date:
          typeof r?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date)
            ? r.date
            : "",
      }));
    if (rows.some((r) => !r.date || r.amount <= 0)) return null;
    const sum = rows.reduce((s, r) => s + r.amount, 0);
    if (Math.abs(sum - totalAmount) > 0.01) return null;
    return rows;
  } catch {
    return null;
  }
}

const DUES_RULES: DuesRule[] = ["inherit", "none", "full", "pledge", "custom"];

/** Parse the period's custom categories (tags) JSON, sanitizing every field. */
export function parseCustomCategories(raw: unknown): CustomCategory[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    const seen = new Set<string>();
    const out: CustomCategory[] = [];
    for (const c of p.slice(0, MAX_CUSTOM_CATEGORIES)) {
      const id = String(c?.id ?? "").slice(0, 24);
      if (!id || seen.has(id)) continue; // drop blank / duplicate ids
      seen.add(id);
      const rule = (DUES_RULES as string[]).includes(String(c?.dues?.rule))
        ? (String(c?.dues?.rule) as DuesRule)
        : "inherit";
      const color = (CATEGORY_COLOR_TOKENS as readonly string[]).includes(
        String(c?.color)
      )
        ? String(c?.color)
        : "slate";
      // A tier must bill — an "inherit" rule has no own rate, so a tier with it
      // would be a silent dead tier. Collapse that limbo state to a plain tag.
      const tier = c?.tier === true && rule !== "inherit";
      const cat: CustomCategory = {
        id,
        name: String(c?.name ?? "").slice(0, 40) || "Category",
        color,
        dues: { rule, amount: Math.max(0, Number(c?.dues?.amount) || 0) },
      };
      if (tier) {
        cat.tier = true;
        const plural = String(c?.plural ?? "").slice(0, 40);
        if (plural) cat.plural = plural;
        const rate = Number(c?.collectionRate);
        // Stored as a 0..1 fraction; recompute defaults a missing one to the
        // period rate, so only clamp when a value is actually present.
        if (Number.isFinite(rate)) cat.collectionRate = Math.min(1, Math.max(0, rate));
      }
      out.push(cat);
    }
    return out;
  } catch {
    return [];
  }
}

/** Parse the materialized custom-tier dues breakdowns JSON (per-tier gross). */
export function parseTierBreakdowns(raw: unknown): TierBreakdown[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return p.slice(0, MAX_CUSTOM_CATEGORIES).map((t: Record<string, unknown>) => ({
      catId: String(t?.catId ?? "").slice(0, 24),
      label: String(t?.label ?? "").slice(0, 40) || "Tier",
      color: (CATEGORY_COLOR_TOKENS as readonly string[]).includes(String(t?.color))
        ? String(t?.color)
        : "slate",
      fullCount: Math.max(0, Math.round(Number(t?.fullCount) || 0)),
      fullRate: Math.max(0, Number(t?.fullRate) || 0),
      aid: Array.isArray(t?.aid)
        ? (t.aid as { name?: unknown; amount?: unknown }[]).map((a) => ({
            name: String(a?.name ?? "").slice(0, 80),
            amount: Math.max(0, Number(a?.amount) || 0),
          }))
        : [],
      collectionRate: Math.min(1, Math.max(0, Number(t?.collectionRate) || 0)),
    }));
  } catch {
    return [];
  }
}

/** Parse a member's tags JSON (an array of category ids), de-duped. */
export function parseMemberTags(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    const out: string[] = [];
    for (const t of p.slice(0, MAX_CUSTOM_CATEGORIES)) {
      const id = String(t ?? "").slice(0, 24);
      if (id && !out.includes(id)) out.push(id);
    }
    return out;
  } catch {
    return [];
  }
}

/** Hydrate a raw periods row: parse the breakdown + plans JSON into typed fields. */
function hydratePeriod(row: Record<string, unknown>): PeriodRow {
  return {
    ...(row as unknown as PeriodRow),
    active_dues_breakdown: parseActiveDuesBreakdown(row.active_dues_breakdown),
    dues_plans: parseDuesPlans(row.dues_plans),
    custom_categories: parseCustomCategories(row.custom_categories),
    custom_tier_breakdowns: parseTierBreakdowns(row.custom_tier_breakdowns),
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
  if (!row || row.sql.includes("variable_expense")) return;
  // Rebuild from the table's own definition so every existing column (incl.
  // actual_amount / period_id) is preserved — only the type CHECK is widened.
  const newSchema = row.sql
    .replace(/CREATE TABLE\s+["']?budget_items["']?/i, "CREATE TABLE budget_items_new")
    .replace(
      /CHECK\s*\(\s*type\s+IN\s*\([^)]*\)\s*\)/i,
      "CHECK (type IN ('fixed_expense', 'planned_event', 'other_income', 'variable_expense'))"
    );
  db.exec(`
    BEGIN;
    ${newSchema};
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
  // Up to date once the CHECK allows 'trash' and the old amount_paid is gone.
  const migrated =
    row.sql.includes("'trash'") && !row.sql.includes("amount_paid");
  if (migrated) return;
  // Preserve every optional column that already exists so a rebuild for the
  // widened status set never silently drops dues data.
  const existing = new Set(
    (db.prepare("PRAGMA table_info(members)").all() as { name: string }[]).map(
      (c) => c.name
    )
  );
  const required = ["id", "user_id", "name", "email", "phone", "status", "created_at"];
  const optional = [
    "aid_plan",
    "aid_amount",
    "dues_paid",
    "collection_stage",
    "contact_count",
    "last_contacted_at",
    "last_contact_channel",
    "period_id",
    "tags",
  ].filter((c) => existing.has(c));
  const copyCols = [...required, ...optional].join(", ");
  db.exec(`
    BEGIN;
    CREATE TABLE members_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pledge', 'alumni', 'inactive', 'trash')),
      aid_plan INTEGER,
      aid_amount REAL,
      dues_paid INTEGER NOT NULL DEFAULT 0,
      collection_stage TEXT NOT NULL DEFAULT 'not_contacted',
      contact_count INTEGER NOT NULL DEFAULT 0,
      last_contacted_at TEXT,
      last_contact_channel TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      period_id INTEGER
    );
    INSERT INTO members_new (${copyCols}) SELECT ${copyCols} FROM members;
    DROP TABLE members;
    ALTER TABLE members_new RENAME TO members;
    CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
    COMMIT;
  `);
}

/** Rename the "active" member status to "brother": "Actives" is now a derived
 * umbrella (brothers + pledges), not a stored status. SQLite can't alter a CHECK
 * in place, so rebuild the members table mapping active -> brother (same shape as
 * migrateMemberStatuses), and rename any 'active' variable-cost basis too. */
function migrateMemberBrotherStatus(db: Database.Database) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='members'")
    .get() as { sql: string } | undefined;
  if (!row) return;
  // Gate on 'brother' being PRESENT, not on 'active' being absent — the CHECK
  // list still contains 'inactive', which has "active" as a substring.
  if (row.sql.includes("'brother'")) return;

  const existing = new Set(
    (db.prepare("PRAGMA table_info(members)").all() as { name: string }[]).map(
      (c) => c.name
    )
  );
  const required = ["id", "user_id", "name", "email", "phone", "status", "created_at"];
  const optional = [
    "aid_plan",
    "aid_amount",
    "dues_paid",
    "collection_stage",
    "contact_count",
    "last_contacted_at",
    "last_contact_channel",
    "period_id",
    "tags",
  ].filter((c) => existing.has(c));
  const cols = [...required, ...optional];
  const copyCols = cols.join(", ");
  // Remap the status value in flight; every other column copies straight across.
  const selectCols = cols
    .map((c) =>
      c === "status"
        ? "CASE status WHEN 'active' THEN 'brother' ELSE status END AS status"
        : c
    )
    .join(", ");

  db.exec(`
    BEGIN;
    CREATE TABLE members_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'brother' CHECK (status IN ('brother', 'pledge', 'alumni', 'inactive', 'trash')),
      aid_plan INTEGER,
      aid_amount REAL,
      dues_paid INTEGER NOT NULL DEFAULT 0,
      collection_stage TEXT NOT NULL DEFAULT 'not_contacted',
      contact_count INTEGER NOT NULL DEFAULT 0,
      last_contacted_at TEXT,
      last_contact_channel TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      period_id INTEGER
    );
    INSERT INTO members_new (${copyCols}) SELECT ${selectCols} FROM members;
    DROP TABLE members;
    ALTER TABLE members_new RENAME TO members;
    CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
    UPDATE budget_items SET cost_basis = 'brother' WHERE cost_basis = 'active';
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
  first_name: string;
  last_name: string;
  phone: string;
  /** The person's role on the chapter exec, e.g. "Treasurer". */
  title: string;
  /** JSON of account preferences (notifications, display, etc.); null = defaults. */
  preferences: string | null;
}

/** Account-level preferences shown in the Settings page (Notifications). */
export interface UserPreferences {
  emailNotifications: boolean;
  smsNotifications: boolean;
  duesReminders: boolean;
  weeklySummary: boolean;
  paymentAlerts: boolean;
  notifyFrequency: string; // realtime | daily | weekly
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  emailNotifications: true,
  smsNotifications: false,
  duesReminders: true,
  weeklySummary: true,
  paymentAlerts: true,
  notifyFrequency: "daily",
};

/** Stored preferences merged over the defaults (so new keys always resolve). */
export function parseUserPreferences(raw: unknown): UserPreferences {
  if (typeof raw !== "string" || !raw) return { ...DEFAULT_USER_PREFERENCES };
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return { ...DEFAULT_USER_PREFERENCES };
    return { ...DEFAULT_USER_PREFERENCES, ...(p as Partial<UserPreferences>) };
  } catch {
    return { ...DEFAULT_USER_PREFERENCES };
  }
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
  // `active_*` = the full-dues BROTHER tier (the field names predate the
  // brother rename). "Actives" in the UI is a derived brothers+pledges umbrella.
  active_members: number;
  current_pledges: number;
  pledges_conservative: number;
  pledges_expected: number;
  pledges_optimistic: number;
  active_dues: number;
  pledge_dues: number;
  collection_rate: number;
  /** Per-tier collection rates; NULL falls back to collection_rate. */
  brother_collection_rate: number | null;
  pledge_collection_rate: number | null;
  starting_balance: number;
  dues_collected: number;
  reserve_target: number;
  dues_schedule: string;
  /** Parsed by the getters; null = flat active_members × active_dues. */
  active_dues_breakdown: ActiveDuesBreakdown | null;
  /** Financial-aid plans (name + preset amount); parsed by the getters. */
  dues_plans: DuesPlan[];
  /** User-defined member categories (tags), each with an optional dues rule. */
  custom_categories: CustomCategory[];
  /** Materialized per-tier dues breakdowns (promoted categories); from the roster. */
  custom_tier_breakdowns: TierBreakdown[];
  collection_payment_instructions: string;
}

export interface BudgetItemRow {
  id: number;
  user_id: number;
  type: "fixed_expense" | "planned_event" | "other_income" | "variable_expense";
  name: string;
  amount: number;
  actual_amount: number | null;
  date: string | null;
  frequency: "one_time" | "monthly" | "yearly";
  category: string;
  attendance: number | null;
  /** For variable_expense: 'brother' | 'pledge' | 'member' — what `amount` is per. */
  cost_basis: string | null;
  notes: string;
  /** 1 once a fixed obligation has been paid (the Bills-Due tracker checkbox). */
  paid: number;
  /** Deposit + balance split for a lumpy outflow; null = single payment on `date`. */
  schedule: ScheduledPayment[] | null;
  /** Units x rate build-up behind `amount`; null = a plain typed-in figure. */
  breakdown: ScheduleLine[] | null;
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
  collection_stage: CollectionStage;
  contact_count: number;
  last_contacted_at: string | null;
  last_contact_channel: ContactChannel | null;
  /** Custom-category ids the member is tagged with; parsed by getMembers. */
  tags: string[];
}

export interface CollectionEventRow {
  id: number;
  user_id: number;
  period_id: number;
  member_id: number;
  member_name: string;
  channel: ContactChannel;
  stage: CollectionStage;
  event_status: "drafted" | "copied" | "logged" | "sent";
  subject: string;
  body: string;
  created_at: string;
}

export function getMembers(userId: number, periodId: number): MemberRow[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM members WHERE user_id = ? AND period_id = ? ORDER BY status ASC, name COLLATE NOCASE ASC"
    )
    .all(userId, periodId) as Record<string, unknown>[];
  return rows.map((r) => ({
    ...(r as unknown as MemberRow),
    tags: parseMemberTags(r.tags),
  }));
}

export function getCollectionEvents(
  userId: number,
  periodId: number,
  limit = 12
): CollectionEventRow[] {
  return getDb()
    .prepare(
      `SELECT e.*, m.name AS member_name
       FROM collection_events e
       JOIN members m ON m.id = e.member_id
       WHERE e.user_id = ? AND e.period_id = ?
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT ?`
    )
    .all(userId, periodId, Math.max(1, Math.min(50, limit))) as CollectionEventRow[];
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
      "SELECT active_dues, pledge_dues, collection_rate, dues_plans, custom_categories FROM periods WHERE id = ? AND user_id = ?"
    )
    .get(periodId, userId) as
    | {
        active_dues: number;
        pledge_dues: number;
        collection_rate: number;
        dues_plans: unknown;
        custom_categories: unknown;
      }
    | undefined;
  if (!period) return;
  const plans = parseDuesPlans(period.dues_plans);
  const cats = parseCustomCategories(period.custom_categories);
  const activeRate = Math.max(0, Number(period.active_dues) || 0);
  const pledgeRate = Math.max(0, Number(period.pledge_dues) || 0);
  const periodRate = Math.min(1, Math.max(0, Number(period.collection_rate) || 0));

  // Load everyone who could owe dues: brothers/pledges, plus anyone (any status)
  // carrying a promoted-tier tag — so a dues-paying alumnus is included. Trash
  // is excluded. Each member is annotated with their tier (or null).
  const members = (
    db
      .prepare(
        "SELECT name, status, aid_plan, aid_amount, dues_paid, tags FROM members WHERE user_id = ? AND period_id = ? AND status != 'trash'"
      )
      .all(userId, periodId) as {
      name: string;
      status: string;
      aid_plan: number | null;
      aid_amount: number | null;
      dues_paid: number;
      tags: unknown;
    }[]
  ).map((m) => {
    const tags = parseMemberTags(m.tags);
    return { ...m, tags, tier: memberTier(tags, cats) };
  });

  const duesOf = (m: (typeof members)[number]) =>
    memberEffectiveDues(
      m.aid_plan,
      m.aid_amount,
      plans,
      memberSetRate(m.status, m.tags, cats, activeRate, pledgeRate)
    );

  // Promoted-tier members are billed in their tier and pulled OUT of the
  // brother bucket, so nothing is double-counted.
  const tierMembers = members.filter((m) => m.tier != null);
  const brothers = members.filter((m) => m.tier == null && m.status === "brother");

  // Full-dues (brother) breakdown: anyone with a plan, an override, or a
  // re-pricing tag is itemized; the rest pay the flat rate (fullCount ×
  // fullRate). The active_* period fields hold this brother tier.
  const aid = brothers
    .filter(
      (m) =>
        m.aid_plan != null ||
        m.aid_amount != null ||
        hasRepricingTag(m.tags, cats)
    )
    .map((m) => ({ name: m.name, amount: duesOf(m) }));
  const breakdown = { fullCount: brothers.length - aid.length, fullRate: activeRate, aid };

  // One breakdown per promoted tier that has members — its own gross + its own
  // collection rate (falling back to the period rate). Mirrors the brother
  // breakdown: full-rate members plus individually-priced (financial-aid) ones.
  const tierBreakdowns: TierBreakdown[] = cats
    .filter((c) => c.tier && c.dues.rule !== "inherit")
    .map((c) => {
      const mine = tierMembers.filter((m) => m.tier!.id === c.id);
      // The tier's flat rate — resolve the rule through memberSetRate (status is
      // irrelevant once a tier tag is present).
      const tierRate = memberSetRate("alumni", [c.id], cats, activeRate, pledgeRate);
      const tAid = mine
        .filter((m) => m.aid_plan != null || m.aid_amount != null)
        .map((m) => ({ name: m.name, amount: duesOf(m) }));
      return {
        catId: c.id,
        label: c.plural || c.name,
        color: c.color,
        fullCount: mine.length - tAid.length,
        fullRate: tierRate,
        aid: tAid,
        collectionRate: c.collectionRate ?? periodRate,
      };
    })
    .filter((t) => t.fullCount + t.aid.length > 0);

  // Collected = dues of everyone checked off (brother, pledge, or tier alike).
  const collected = members
    .filter((m) => m.dues_paid === 1)
    .reduce((sum, m) => sum + duesOf(m), 0);

  db.prepare(
    "UPDATE periods SET active_members = ?, active_dues_breakdown = ?, custom_tier_breakdowns = ?, dues_collected = ? WHERE id = ? AND user_id = ?"
  ).run(
    brothers.length,
    JSON.stringify(breakdown),
    JSON.stringify(tierBreakdowns),
    collected,
    periodId,
    userId
  );
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
  const rows = getDb()
    .prepare(
      "SELECT * FROM budget_items WHERE user_id = ? AND period_id = ? ORDER BY date IS NULL, date ASC, id ASC"
    )
    .all(userId, periodId) as (Omit<BudgetItemRow, "schedule" | "breakdown"> & {
    schedule: unknown;
    breakdown: unknown;
  })[];
  return rows.map((r) => ({
    ...r,
    schedule: parseSchedule(r.schedule, r.amount),
    breakdown: parseBreakdown(r.breakdown),
  }));
}
