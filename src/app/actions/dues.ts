"use server";

import { revalidatePath } from "next/cache";
import { getDb, getActivePeriod, recomputeDerivedDues } from "@/lib/db";
import { MAX_DUES_PLANS } from "@/lib/memberDues";
import { requireUser } from "@/lib/auth";

const PATHS = [
  "/dashboard",
  "/budget",
  "/actuals",
  "/dues",
  "/scenarios",
  "/periods",
  "/collections",
];

function revalidateAll() {
  for (const p of PATHS) revalidatePath(p);
}

function clampMoney(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  if (isNaN(n) || n < 0) return 0;
  return Math.min(1_000_000, n);
}

/** Put a member on a financial-aid plan, or back on the set rate ("" / "full"). */
export async function setMemberDuesPlan(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!id) return;
  const period = getActivePeriod(user.id);
  if (!period) return;
  const raw = String(formData.get("plan") ?? "");
  let plan: number | null = null;
  if (raw !== "" && raw !== "full") {
    const idx = Math.floor(Number(raw));
    if (Number.isFinite(idx) && idx >= 0 && idx < period.dues_plans.length) {
      plan = idx;
    }
  }
  // Switching category resets the amount to that category's default; the
  // treasurer can then type an individual override.
  getDb()
    .prepare(
      "UPDATE members SET aid_plan = ?, aid_amount = NULL WHERE id = ? AND user_id = ?"
    )
    .run(plan, id, user.id);
  recomputeDerivedDues(user.id, period.id);
  revalidateAll();
}

/** Override an aid member's amount; blank clears the override (use the preset). */
export async function setMemberAidAmount(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!id) return;
  const period = getActivePeriod(user.id);
  if (!period) return;
  const raw = String(formData.get("amount") ?? "").trim();
  const amount = raw === "" ? null : clampMoney(raw);
  getDb()
    .prepare("UPDATE members SET aid_amount = ? WHERE id = ? AND user_id = ?")
    .run(amount, id, user.id);
  recomputeDerivedDues(user.id, period.id);
  revalidateAll();
}

/** The Dues-tab checkbox: mark a member paid or unpaid. */
export async function setMemberDuesPaid(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!id) return;
  const period = getActivePeriod(user.id);
  const paid = String(formData.get("paid")) === "1" ? 1 : 0;
  getDb()
    .prepare(
      `UPDATE members
       SET dues_paid = ?,
           collection_stage = CASE WHEN ? = 1 THEN 'paid' ELSE collection_stage END
       WHERE id = ? AND user_id = ?`
    )
    .run(paid, paid, id, user.id);
  // Roll the checkbox into the period's collected-to-date.
  if (period) recomputeDerivedDues(user.id, period.id);
  revalidateAll();
}

/** Edit the set dues rates (also editable on the Budget tab). */
export async function setDuesRates(formData: FormData): Promise<void> {
  const user = await requireUser();
  const period = getActivePeriod(user.id);
  if (!period) return;
  const activeDues = clampMoney(formData.get("activeDues"));
  const pledgeDues = clampMoney(formData.get("pledgeDues"));
  getDb()
    .prepare(
      "UPDATE periods SET active_dues = ?, pledge_dues = ? WHERE id = ? AND user_id = ?"
    )
    .run(activeDues, pledgeDues, period.id, user.id);
  recomputeDerivedDues(user.id, period.id);
  revalidateAll();
}

/** Edit the financial-aid plans (name + preset amount). Sent as a JSON array. */
export async function setDuesPlans(formData: FormData): Promise<void> {
  const user = await requireUser();
  const period = getActivePeriod(user.id);
  if (!period) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("plans") ?? "[]"));
  } catch {
    return;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return;
  const plans = parsed
    .slice(0, MAX_DUES_PLANS)
    .map((d: { name?: unknown; amount?: unknown }) => ({
      name: String(d?.name ?? "").trim().slice(0, 40) || "Plan",
      amount: clampMoney(d?.amount),
    }));
  getDb()
    .prepare("UPDATE periods SET dues_plans = ? WHERE id = ? AND user_id = ?")
    .run(JSON.stringify(plans), period.id, user.id);
  recomputeDerivedDues(user.id, period.id);
  revalidateAll();
}
