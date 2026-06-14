"use server";

import { revalidatePath } from "next/cache";
import { getDb, getActivePeriod, recomputeDerivedDues } from "@/lib/db";
import { MEMBER_STATUSES, MemberStatus } from "@/lib/memberStatus";
import { requireUser } from "@/lib/auth";

const PATHS = ["/dashboard", "/budget", "/actuals", "/members", "/scenarios", "/periods"];

function revalidateAll() {
  for (const p of PATHS) revalidatePath(p);
}

function parseStatus(v: unknown): MemberStatus {
  const s = String(v);
  return (MEMBER_STATUSES.some((m) => m.value === s) ? s : "active") as MemberStatus;
}

function cleanContact(v: unknown, max = 120): string {
  return String(v ?? "").trim().slice(0, max);
}

export async function addMember(formData: FormData): Promise<void> {
  const user = await requireUser();
  const name = cleanContact(formData.get("name"));
  if (!name) return;
  const period = getActivePeriod(user.id);
  if (!period) return;
  getDb()
    .prepare(
      "INSERT INTO members (user_id, period_id, name, email, phone, status) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      user.id,
      period.id,
      name,
      cleanContact(formData.get("email")),
      cleanContact(formData.get("phone"), 40),
      parseStatus(formData.get("status"))
    );
  recomputeDerivedDues(user.id, period.id);
  revalidateAll();
}

export async function updateMember(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const name = cleanContact(formData.get("name"));
  if (!id || !name) return;
  const period = getActivePeriod(user.id);
  getDb()
    .prepare(
      `UPDATE members SET name = ?, email = ?, phone = ?, status = ?
       WHERE id = ? AND user_id = ?`
    )
    .run(
      name,
      cleanContact(formData.get("email")),
      cleanContact(formData.get("phone"), 40),
      parseStatus(formData.get("status")),
      id,
      user.id
    );
  if (period) recomputeDerivedDues(user.id, period.id);
  revalidateAll();
}

/**
 * Change just a member's category — used by drag-and-drop and by the
 * trash/restore actions. "Deleting" a member moves them to the `trash`
 * category rather than erasing the row, so it can always be undone.
 */
export async function setMemberStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!id) return;
  const status = parseStatus(formData.get("status"));
  const period = getActivePeriod(user.id);
  getDb()
    .prepare("UPDATE members SET status = ? WHERE id = ? AND user_id = ?")
    .run(status, id, user.id);
  if (period) recomputeDerivedDues(user.id, period.id);
  revalidateAll();
}

/** Permanently erase a member (used to empty the Trash bin). */
export async function deleteMember(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!id) return;
  const period = getActivePeriod(user.id);
  getDb()
    .prepare("DELETE FROM members WHERE id = ? AND user_id = ?")
    .run(id, user.id);
  if (period) recomputeDerivedDues(user.id, period.id);
  revalidateAll();
}
