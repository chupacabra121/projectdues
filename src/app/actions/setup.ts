"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  getDb,
  defaultSemester,
  getActivePeriod,
  periodNameFor,
  recomputeDerivedDues,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { setFlash } from "@/lib/flash";

export interface OnboardingPayload {
  activeMembers: number;
  currentPledges: number;
  pledgesConservative: number;
  pledgesExpected: number;
  pledgesOptimistic: number;
  activeDues: number;
  pledgeDues: number;
  collectionRate: number; // percent, 0-100 — the blended figure, kept for legacy readers
  /** Per-tier rates, percent 0-100. Undefined leaves the column NULL (falls back to blended). */
  brotherCollectionRate?: number;
  pledgeCollectionRate?: number;
}

export interface OnboardingMember {
  name: string;
  email: string;
  phone: string;
  status: "brother" | "pledge";
}

function clampInt(n: unknown, min = 0, max = 100000): number {
  const v = Math.round(Number(n));
  if (isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}

function clampMoney(n: unknown): number {
  const v = Number(n);
  if (isNaN(v)) return 0;
  return Math.min(10_000_000, Math.max(0, v));
}

export async function completeOnboarding(
  payload: OnboardingPayload,
  members: OnboardingMember[] = []
): Promise<void> {
  const user = await requireUser();

  // Guard against a replayed or stale-tab submit: if onboarding already ran,
  // don't insert a second period — just send them in.
  const existing = getActivePeriod(user.id);
  if (existing) redirect("/dashboard");

  const sem = defaultSemester();
  const rate = Math.min(100, Math.max(0, Number(payload.collectionRate) || 0)) / 100;

  const db = getDb();
  const setup = db.transaction(() => {
    const pid = Number(
      db
        .prepare(
          `INSERT INTO periods (
            user_id, name, semester_start, semester_end,
            active_members, current_pledges,
            pledges_conservative, pledges_expected, pledges_optimistic,
            active_dues, pledge_dues, collection_rate
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          user.id,
          periodNameFor(sem.start),
          sem.start,
          sem.end,
          clampInt(payload.activeMembers),
          clampInt(payload.currentPledges),
          clampInt(payload.pledgesConservative),
          clampInt(payload.pledgesExpected),
          clampInt(payload.pledgesOptimistic),
          clampMoney(payload.activeDues),
          clampMoney(payload.pledgeDues),
          rate
        ).lastInsertRowid
    );

    db.prepare(
      `INSERT INTO settings (user_id, onboarded, active_period_id)
       VALUES (?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET onboarded = 1, active_period_id = excluded.active_period_id`
    ).run(user.id, pid);

    if (members.length > 0) {
      const insert = db.prepare(
        "INSERT INTO members (user_id, period_id, name, email, phone, status) VALUES (?, ?, ?, ?, ?, ?)"
      );
      db.prepare("DELETE FROM members WHERE user_id = ? AND period_id = ?").run(user.id, pid);
      for (const m of members.slice(0, 2000)) {
        const name = String(m.name ?? "").trim().slice(0, 120);
        if (!name) continue;
        insert.run(
          user.id,
          pid,
          name,
          String(m.email ?? "").trim().slice(0, 120),
          String(m.phone ?? "").trim().slice(0, 40),
          m.status === "pledge" ? "pledge" : "brother"
        );
      }
    }
  });
  setup();

  redirect("/dashboard");
}

export interface BudgetSettingsPayload {
  /** The set active-dues rate; per-member dues/aid are derived from the roster. */
  activeDues: number;
  pledgeDues: number;
  collectionRate: number; // percent, 0-100 — the blended figure, kept for legacy readers
  /** Per-tier rates, percent 0-100. Undefined leaves the column NULL (falls back to blended). */
  brotherCollectionRate?: number;
  pledgeCollectionRate?: number;
  pledgesConservative: number;
  pledgesExpected: number;
  pledgesOptimistic: number;
  startingBalance: number;
  reserveTarget: number;
  semesterStart: string; // YYYY-MM-DD
  semesterEnd: string;
  /** When dues arrive: sixweek | upfront | monthly | thirds (drives the cash curve). */
  duesSchedule?: string;
}

/** A 0-100 percent payload field as a 0..1 rate, or NULL when not supplied. */
function pctOrNull(v: number | undefined): number | null {
  if (v == null || Number.isNaN(Number(v))) return null;
  return Math.min(100, Math.max(0, Number(v))) / 100;
}

const DUES_SCHEDULES = ["sixweek", "upfront", "monthly", "thirds"];
function parseDuesSchedule(v: unknown): string {
  const s = String(v ?? "");
  return DUES_SCHEDULES.includes(s) ? s : "sixweek";
}

function parseIsoDate(v: unknown, fallback: string): string {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

/** Saves the Budget tab's Money In panel — membership, dues, scenarios,
 * balances, and the semester window — in one shot (used by auto-save). */
export async function updateBudgetSettings(
  payload: BudgetSettingsPayload
): Promise<void> {
  const user = await requireUser();
  const period = getActivePeriod(user.id);
  if (!period) {
    await setFlash("No active period — your changes didn't save.", "warn");
    return;
  }
  const sem = defaultSemester();

  // active_members, the aid breakdown, and dues_collected are all derived
  // (recomputeDerivedDues below); the Budget tab only sets the rates/scenarios.
  getDb()
    .prepare(
      `UPDATE periods SET
        active_dues = ?,
        pledge_dues = ?, collection_rate = ?,
        brother_collection_rate = ?, pledge_collection_rate = ?,
        pledges_conservative = ?, pledges_expected = ?, pledges_optimistic = ?,
        starting_balance = ?, reserve_target = ?,
        semester_start = ?, semester_end = ?,
        dues_schedule = ?
      WHERE id = ? AND user_id = ?`
    )
    .run(
      clampMoney(payload.activeDues),
      clampMoney(payload.pledgeDues),
      Math.min(100, Math.max(0, Number(payload.collectionRate) || 0)) / 100,
      pctOrNull(payload.brotherCollectionRate),
      pctOrNull(payload.pledgeCollectionRate),
      clampInt(payload.pledgesConservative),
      clampInt(payload.pledgesExpected),
      clampInt(payload.pledgesOptimistic),
      clampMoney(payload.startingBalance),
      clampMoney(payload.reserveTarget),
      parseIsoDate(payload.semesterStart, sem.start),
      parseIsoDate(payload.semesterEnd, sem.end),
      parseDuesSchedule(payload.duesSchedule),
      period.id,
      user.id
    );
  // Re-derive active_members + breakdown + dues_collected from the roster.
  recomputeDerivedDues(user.id, period.id);
  revalidatePath("/dashboard");
  revalidatePath("/budget");
  revalidatePath("/assumptions");
  revalidatePath("/actuals");
  revalidatePath("/dues");
  revalidatePath("/scenarios");
  revalidatePath("/periods");
}
