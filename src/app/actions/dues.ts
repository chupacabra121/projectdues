"use server";

import { revalidatePath } from "next/cache";
import {
  getDb,
  getActivePeriod,
  recomputeDerivedDues,
  parseCustomCategories,
  parseMemberTags,
} from "@/lib/db";
import { MAX_DUES_PLANS } from "@/lib/memberDues";
import { requireUser } from "@/lib/auth";

const PATHS = [
  "/dashboard",
  "/budget",
  "/actuals",
  "/dues",
  "/members",
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
  const db = getDb();
  db.prepare("UPDATE periods SET dues_plans = ? WHERE id = ? AND user_id = ?")
    .run(JSON.stringify(plans), period.id, user.id);
  // Members pointing at a plan index that no longer exists revert to their
  // status rate — clear the dangling reference so a future plan added at that
  // index can't silently re-price them.
  db.prepare(
    "UPDATE members SET aid_plan = NULL WHERE user_id = ? AND period_id = ? AND aid_plan >= ?"
  ).run(user.id, period.id, plans.length);
  recomputeDerivedDues(user.id, period.id);
  revalidateAll();
}

/**
 * Save the period's custom member categories (tags). The client sends the full
 * list as JSON; parseCustomCategories sanitizes every field + drops dup ids.
 * Recomputes dues since a category's rule can re-price tagged members.
 */
export async function setCustomCategories(formData: FormData): Promise<void> {
  const user = await requireUser();
  const period = getActivePeriod(user.id);
  if (!period) return;
  const cats = parseCustomCategories(formData.get("categories"));
  const db = getDb();
  db.prepare(
    "UPDATE periods SET custom_categories = ? WHERE id = ? AND user_id = ?"
  ).run(JSON.stringify(cats), period.id, user.id);
  // Prune now-orphaned tag ids so a deleted category doesn't linger invisibly
  // on members (keeps the roster's tags in sync with the surviving categories).
  const validIds = new Set(cats.map((c) => c.id));
  const roster = db
    .prepare("SELECT id, tags FROM members WHERE user_id = ? AND period_id = ?")
    .all(user.id, period.id) as { id: number; tags: string }[];
  const prune = db.prepare("UPDATE members SET tags = ? WHERE id = ? AND user_id = ?");
  for (const m of roster) {
    const orig = parseMemberTags(m.tags);
    const kept = orig.filter((id) => validIds.has(id));
    if (kept.length !== orig.length) prune.run(JSON.stringify(kept), m.id, user.id);
  }
  recomputeDerivedDues(user.id, period.id);
  revalidateAll();
}
