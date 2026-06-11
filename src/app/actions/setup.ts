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

export async function updateScenarios(formData: FormData): Promise<void> {
  const user = await requireUser();
  getDb()
    .prepare(
      `UPDATE settings SET
        pledges_conservative = ?, pledges_expected = ?, pledges_optimistic = ?
      WHERE user_id = ?`
    )
    .run(
      clampInt(formData.get("conservative")),
      clampInt(formData.get("expected")),
      clampInt(formData.get("optimistic")),
      user.id
    );
  revalidatePath("/scenarios");
  revalidatePath("/dashboard");
}

export async function updateFinancials(formData: FormData): Promise<void> {
  const user = await requireUser();
  getDb()
    .prepare(
      `UPDATE settings SET
        active_members = ?, active_dues = ?, pledge_dues = ?,
        collection_rate = ?, starting_balance = ?, dues_collected = ?,
        reserve_target = ?
      WHERE user_id = ?`
    )
    .run(
      clampInt(formData.get("active_members")),
      clampMoney(formData.get("active_dues")),
      clampMoney(formData.get("pledge_dues")),
      Math.min(100, Math.max(0, Number(formData.get("collection_rate")) || 0)) / 100,
      clampMoney(formData.get("starting_balance")),
      clampMoney(formData.get("dues_collected")),
      clampMoney(formData.get("reserve_target")),
      user.id
    );
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/scenarios");
}
