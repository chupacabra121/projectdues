"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { categorizeEvent, categorizeExpense } from "@/lib/categorize";

const PATHS = ["/budget", "/dashboard", "/scenarios"];

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

export async function addBudgetItem(formData: FormData): Promise<void> {
  const user = await requireUser();
  const type = String(formData.get("type"));
  if (type !== "fixed_expense" && type !== "planned_event") return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const amount = parseAmount(formData.get("amount"));
  const date = parseDate(formData.get("date"));
  const freqRaw = String(formData.get("frequency") ?? "one_time");
  const frequency = ["one_time", "monthly", "yearly"].includes(freqRaw)
    ? freqRaw
    : "one_time";

  let category = String(formData.get("category") ?? "").trim();
  if (!category || category === "auto") {
    category =
      type === "planned_event" ? categorizeEvent(name) : categorizeExpense(name);
  }

  const attendanceRaw = Number(formData.get("attendance"));
  const attendance =
    !isNaN(attendanceRaw) && attendanceRaw > 0 ? Math.round(attendanceRaw) : null;
  const notes = String(formData.get("notes") ?? "").trim();

  getDb()
    .prepare(
      `INSERT INTO budget_items (user_id, type, name, amount, date, frequency, category, attendance, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      user.id,
      type,
      name,
      amount,
      date,
      type === "planned_event" ? "one_time" : frequency,
      category,
      type === "planned_event" ? attendance : null,
      notes
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
