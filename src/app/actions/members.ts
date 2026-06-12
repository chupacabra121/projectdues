"use server";

import { revalidatePath } from "next/cache";
import { getDb, getMembers } from "@/lib/db";
import { requireUser } from "@/lib/auth";

const PATHS = ["/dashboard", "/budget", "/members", "/scenarios"];

function revalidateAll() {
  for (const p of PATHS) revalidatePath(p);
}

function parseStatus(v: unknown): "active" | "pledge" {
  return String(v) === "pledge" ? "pledge" : "active";
}

function parsePaid(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  if (isNaN(n) || n < 0) return 0;
  return Math.min(1_000_000, n);
}

function cleanContact(v: unknown, max = 120): string {
  return String(v ?? "").trim().slice(0, max);
}

export async function addMember(formData: FormData): Promise<void> {
  const user = await requireUser();
  const name = cleanContact(formData.get("name"));
  if (!name) return;
  getDb()
    .prepare(
      "INSERT INTO members (user_id, name, email, phone, status, amount_paid) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      user.id,
      name,
      cleanContact(formData.get("email")),
      cleanContact(formData.get("phone"), 40),
      parseStatus(formData.get("status")),
      parsePaid(formData.get("amount_paid"))
    );
  revalidateAll();
}

export async function updateMember(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const name = cleanContact(formData.get("name"));
  if (!id || !name) return;
  getDb()
    .prepare(
      `UPDATE members SET name = ?, email = ?, phone = ?, status = ?, amount_paid = ?
       WHERE id = ? AND user_id = ?`
    )
    .run(
      name,
      cleanContact(formData.get("email")),
      cleanContact(formData.get("phone"), 40),
      parseStatus(formData.get("status")),
      parsePaid(formData.get("amount_paid")),
      id,
      user.id
    );
  revalidateAll();
}

/** Quick action: mark a member as having paid their full dues. */
export async function markMemberPaid(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const amount = parsePaid(formData.get("amount"));
  if (!id) return;
  getDb()
    .prepare("UPDATE members SET amount_paid = ? WHERE id = ? AND user_id = ?")
    .run(amount, id, user.id);
  revalidateAll();
}

export async function deleteMember(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!id) return;
  getDb()
    .prepare("DELETE FROM members WHERE id = ? AND user_id = ?")
    .run(id, user.id);
  revalidateAll();
}

/**
 * Push roster truth into the budget: active/pledge headcounts and total
 * dues collected. Keeps the forecast in step with the member list.
 */
export async function syncRosterToBudget(): Promise<void> {
  const user = await requireUser();
  const members = getMembers(user.id);
  if (members.length === 0) return;
  const actives = members.filter((m) => m.status === "active").length;
  const pledges = members.filter((m) => m.status === "pledge").length;
  const collected = members.reduce((sum, m) => sum + m.amount_paid, 0);
  getDb()
    .prepare(
      `UPDATE settings SET active_members = ?, current_pledges = ?, dues_collected = ?
       WHERE user_id = ?`
    )
    .run(actives, pledges, collected, user.id);
  revalidateAll();
}
