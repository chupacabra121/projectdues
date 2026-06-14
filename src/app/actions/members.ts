"use server";

import { revalidatePath } from "next/cache";
import {
  getDb,
  getActivePeriod,
  recomputeDerivedDues,
  parseMemberTags,
  parseCustomCategories,
} from "@/lib/db";
import { MEMBER_STATUSES, MemberStatus } from "@/lib/memberStatus";
import { requireUser } from "@/lib/auth";

const PATHS = [
  "/dashboard",
  "/budget",
  "/actuals",
  "/members",
  "/dues",
  "/collections",
  "/scenarios",
  "/periods",
];

/** Sanitize a member's tags from a JSON string: known category ids only, de-duped. */
function cleanTags(raw: unknown, periodId: number, userId: number): string {
  const ids = parseMemberTags(raw);
  if (ids.length === 0) return "[]";
  const period = getDb()
    .prepare("SELECT custom_categories FROM periods WHERE id = ? AND user_id = ?")
    .get(periodId, userId) as { custom_categories: unknown } | undefined;
  const valid = new Set(parseCustomCategories(period?.custom_categories).map((c) => c.id));
  return JSON.stringify(ids.filter((id) => valid.has(id)));
}

function revalidateAll() {
  for (const p of PATHS) revalidatePath(p);
}

function parseStatus(v: unknown): MemberStatus {
  const s = String(v);
  return (MEMBER_STATUSES.some((m) => m.value === s) ? s : "brother") as MemberStatus;
}

function cleanContact(v: unknown, max = 120): string {
  return String(v ?? "").trim().slice(0, max);
}

export interface ImportMemberInput {
  name: string;
  email: string;
  phone: string;
  status: string;
}

export interface ImportSummary {
  imported: number;
  duplicates: number;
  skipped: number;
}

/**
 * Bulk-add members to the active period from an imported/pasted roster.
 * Appends (never replaces) and de-duplicates against the existing roster —
 * by email when present, otherwise by name — so re-importing is safe.
 * `statusOverride`, when a valid category, forces every imported member to it;
 * otherwise each row keeps its parsed status (defaulting to active).
 */
export async function importMembers(
  rows: ImportMemberInput[],
  statusOverride?: string
): Promise<ImportSummary> {
  const summary: ImportSummary = { imported: 0, duplicates: 0, skipped: 0 };
  const user = await requireUser();
  const period = getActivePeriod(user.id);
  if (!period || !Array.isArray(rows)) return summary;

  const db = getDb();
  const existing = db
    .prepare("SELECT name, email FROM members WHERE user_id = ? AND period_id = ?")
    .all(user.id, period.id) as { name: string; email: string }[];
  const seenEmails = new Set(
    existing.map((e) => e.email.trim().toLowerCase()).filter(Boolean)
  );
  const seenNames = new Set(existing.map((e) => e.name.trim().toLowerCase()));

  const override =
    statusOverride && MEMBER_STATUSES.some((m) => m.value === statusOverride)
      ? (statusOverride as MemberStatus)
      : null;

  const insert = db.prepare(
    "INSERT INTO members (user_id, period_id, name, email, phone, status) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const run = db.transaction(() => {
    for (const r of rows.slice(0, 5000)) {
      const name = cleanContact(r?.name);
      if (!name) {
        summary.skipped++;
        continue;
      }
      const email = cleanContact(r?.email);
      const emailKey = email.toLowerCase();
      const nameKey = name.toLowerCase();
      // De-dup: prefer email match; fall back to an exact name match.
      if (emailKey ? seenEmails.has(emailKey) : seenNames.has(nameKey)) {
        summary.duplicates++;
        continue;
      }
      const status = override ?? parseStatus(r?.status);
      insert.run(user.id, period.id, name, email, cleanContact(r?.phone, 40), status);
      if (emailKey) seenEmails.add(emailKey);
      seenNames.add(nameKey);
      summary.imported++;
    }
  });
  run();

  if (summary.imported > 0) {
    recomputeDerivedDues(user.id, period.id);
    revalidateAll();
  }
  return summary;
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
  const email = cleanContact(formData.get("email"));
  const phone = cleanContact(formData.get("phone"), 40);
  const status = parseStatus(formData.get("status"));
  // The edit form carries tags; other callers may not — only touch tags when present.
  if (formData.has("tags") && period) {
    getDb()
      .prepare(
        `UPDATE members SET name = ?, email = ?, phone = ?, status = ?, tags = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(
        name,
        email,
        phone,
        status,
        cleanTags(formData.get("tags"), period.id, user.id),
        id,
        user.id
      );
  } else {
    getDb()
      .prepare(
        `UPDATE members SET name = ?, email = ?, phone = ?, status = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(name, email, phone, status, id, user.id);
  }
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

/** Set a member's custom-category tags (from the row's tag editor). */
export async function setMemberTags(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!id) return;
  const period = getActivePeriod(user.id);
  if (!period) return;
  getDb()
    .prepare("UPDATE members SET tags = ? WHERE id = ? AND user_id = ?")
    .run(cleanTags(formData.get("tags"), period.id, user.id), id, user.id);
  recomputeDerivedDues(user.id, period.id);
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
