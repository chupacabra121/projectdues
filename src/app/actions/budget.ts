"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  categorizeEvent,
  categorizeExpense,
  categorizeIncome,
} from "@/lib/categorize";

const PATHS = ["/dashboard", "/budget", "/scenarios"];
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
  getDb()
    .prepare(
      `INSERT INTO budget_items (user_id, type, name, amount, date, frequency, category, attendance, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      user.id,
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

export async function deleteBudgetItem(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!id) return;
  getDb()
    .prepare("DELETE FROM budget_items WHERE id = ? AND user_id = ?")
    .run(id, user.id);
  revalidateAll();
}
