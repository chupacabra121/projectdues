"use server";

import { revalidatePath } from "next/cache";
import { getDb, getActivePeriod } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  categorizeEvent,
  categorizeExpense,
  categorizeIncome,
} from "@/lib/categorize";

const PATHS = ["/dashboard", "/budget", "/actuals", "/scenarios", "/periods"];
const ITEM_TYPES = ["fixed_expense", "planned_event", "other_income"] as const;
type ItemType = (typeof ITEM_TYPES)[number];

function revalidateAll() {
  for (const p of PATHS) revalidatePath(p);
}

function parseAmount(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  if (isNaN(n) || n < 0) return 0;
  return Math.min(10_000_000, n);
}

function parseDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function autoCategorize(type: ItemType, name: string): string {
  if (type === "planned_event") return categorizeEvent(name);
  if (type === "other_income") return categorizeIncome(name);
  return categorizeExpense(name);
}

interface ParsedItem {
  type: ItemType;
  name: string;
  amount: number;
  date: string | null;
  frequency: "one_time" | "monthly" | "yearly";
  category: string;
  attendance: number | null;
  notes: string;
}

function parseItemForm(formData: FormData): ParsedItem | null {
  const type = String(formData.get("type")) as ItemType;
  if (!ITEM_TYPES.includes(type)) return null;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return null;

  const freqRaw = String(formData.get("frequency") ?? "one_time");
  const frequency = (
    ["one_time", "monthly", "yearly"].includes(freqRaw) ? freqRaw : "one_time"
  ) as ParsedItem["frequency"];

  let category = String(formData.get("category") ?? "").trim();
  if (!category || category === "auto") category = autoCategorize(type, name);

  const attendanceRaw = Number(formData.get("attendance"));
  const attendance =
    type === "planned_event" && !isNaN(attendanceRaw) && attendanceRaw > 0
      ? Math.round(attendanceRaw)
      : null;

  return {
    type,
    name,
    amount: parseAmount(formData.get("amount")),
    date: parseDate(formData.get("date")),
    frequency: type === "planned_event" ? "one_time" : frequency,
    category,
    attendance,
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

export async function addBudgetItem(formData: FormData): Promise<void> {
  const user = await requireUser();
  const item = parseItemForm(formData);
  if (!item) return;
  const period = getActivePeriod(user.id);
  if (!period) return;
  // New items carry no actual yet — actuals are recorded on the Plan vs
  // Actual page once a cost is known.
  getDb()
    .prepare(
      `INSERT INTO budget_items (user_id, period_id, type, name, amount, actual_amount, date, frequency, category, attendance, notes)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`
    )
    .run(
      user.id,
      period.id,
      item.type,
      item.name,
      item.amount,
      item.date,
      item.frequency,
      item.category,
      item.attendance,
      item.notes
    );
  revalidateAll();
}

export async function updateBudgetItem(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const item = parseItemForm(formData);
  if (!id || !item) return;
  // Planning fields only — actual_amount is owned by the Plan vs Actual page
  // and deliberately left untouched here.
  getDb()
    .prepare(
      `UPDATE budget_items SET
        name = ?, amount = ?, date = ?, frequency = ?, category = ?, attendance = ?, notes = ?
       WHERE id = ? AND user_id = ? AND type = ?`
    )
    .run(
      item.name,
      item.amount,
      item.date,
      item.frequency,
      item.category,
      item.attendance,
      item.notes,
      id,
      user.id,
      item.type
    );
  revalidateAll();
}

export async function updateBudgetItemCategory(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const category = String(formData.get("category") ?? "").trim();
  if (!id || !category) return;
  getDb()
    .prepare("UPDATE budget_items SET category = ? WHERE id = ? AND user_id = ?")
    .run(category, id, user.id);
  revalidateAll();
}

/** Set (or clear, with an empty/zero cap) a category spending allocation. */
export async function setCategoryCap(formData: FormData): Promise<void> {
  const user = await requireUser();
  const category = String(formData.get("category") ?? "").trim();
  if (!category) return;
  const period = getActivePeriod(user.id);
  if (!period) return;
  const cap = parseAmount(formData.get("cap"));
  const db = getDb();
  if (cap > 0) {
    db.prepare(
      `INSERT INTO category_caps (user_id, period_id, category, cap) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, period_id, category) DO UPDATE SET cap = excluded.cap`
    ).run(user.id, period.id, category, cap);
  } else {
    db.prepare(
      "DELETE FROM category_caps WHERE user_id = ? AND period_id = ? AND category = ?"
    ).run(user.id, period.id, category);
  }
  revalidateAll();
}

/**
 * Record (or clear) what an item really cost, from the Plan vs Actual page.
 * An empty value clears the actual and reverts to the planned amount. For
 * monthly items the actual is per-occurrence, mirroring the planned amount.
 */
export async function setActualAmount(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!id) return;
  const raw = String(formData.get("actual") ?? "").trim();
  const actual = raw === "" ? null : parseAmount(raw);
  getDb()
    .prepare("UPDATE budget_items SET actual_amount = ? WHERE id = ? AND user_id = ?")
    .run(actual, id, user.id);
  revalidateAll();
}

export async function deleteBudgetItem(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!id) return;
  getDb()
    .prepare("DELETE FROM budget_items WHERE id = ? AND user_id = ?")
    .run(id, user.id);
  revalidateAll();
}
