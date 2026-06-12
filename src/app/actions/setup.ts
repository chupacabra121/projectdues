"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, defaultSemester } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export interface OnboardingPayload {
  activeMembers: number;
  currentPledges: number;
  pledgesConservative: number;
  pledgesExpected: number;
  pledgesOptimistic: number;
  activeDues: number;
  pledgeDues: number;
  collectionRate: number; // percent, 0-100
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

export async function completeOnboarding(payload: OnboardingPayload): Promise<void> {
  const user = await requireUser();
  const sem = defaultSemester();
  const rate = Math.min(100, Math.max(0, Number(payload.collectionRate) || 0)) / 100;

  getDb()
    .prepare(
      `INSERT INTO settings (
        user_id, onboarded, active_members, current_pledges,
        pledges_conservative, pledges_expected, pledges_optimistic,
        active_dues, pledge_dues, collection_rate, semester_start, semester_end
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        onboarded = 1,
        active_members = excluded.active_members,
        current_pledges = excluded.current_pledges,
        pledges_conservative = excluded.pledges_conservative,
        pledges_expected = excluded.pledges_expected,
        pledges_optimistic = excluded.pledges_optimistic,
        active_dues = excluded.active_dues,
        pledge_dues = excluded.pledge_dues,
        collection_rate = excluded.collection_rate`
    )
    .run(
      user.id,
      clampInt(payload.activeMembers),
      clampInt(payload.currentPledges),
      clampInt(payload.pledgesConservative),
      clampInt(payload.pledgesExpected),
      clampInt(payload.pledgesOptimistic),
      clampMoney(payload.activeDues),
      clampMoney(payload.pledgeDues),
      rate,
      sem.start,
      sem.end
    );

  redirect("/dashboard");
}

export interface BudgetSettingsPayload {
  activeMembers: number;
  activeDues: number;
  pledgeDues: number;
  collectionRate: number; // percent, 0-100
  pledgesConservative: number;
  pledgesExpected: number;
  pledgesOptimistic: number;
  startingBalance: number;
  duesCollected: number;
  reserveTarget: number;
  semesterStart: string; // YYYY-MM-DD
  semesterEnd: string;
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
  const sem = defaultSemester();
  getDb()
    .prepare(
      `UPDATE settings SET
        active_members = ?, active_dues = ?, pledge_dues = ?, collection_rate = ?,
        pledges_conservative = ?, pledges_expected = ?, pledges_optimistic = ?,
        starting_balance = ?, dues_collected = ?, reserve_target = ?,
        semester_start = ?, semester_end = ?
      WHERE user_id = ?`
    )
    .run(
      clampInt(payload.activeMembers),
      clampMoney(payload.activeDues),
      clampMoney(payload.pledgeDues),
      Math.min(100, Math.max(0, Number(payload.collectionRate) || 0)) / 100,
      clampInt(payload.pledgesConservative),
      clampInt(payload.pledgesExpected),
      clampInt(payload.pledgesOptimistic),
      clampMoney(payload.startingBalance),
      clampMoney(payload.duesCollected),
      clampMoney(payload.reserveTarget),
      parseIsoDate(payload.semesterStart, sem.start),
      parseIsoDate(payload.semesterEnd, sem.end),
      user.id
    );
  revalidatePath("/budget");
  revalidatePath("/dashboard");
  revalidatePath("/scenarios");
}
