"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getActivePeriod, getDb, recomputeDerivedDues } from "@/lib/db";
import { setFlash } from "@/lib/flash";
import {
  COLLECTION_STAGES,
  CONTACT_CHANNELS,
  CollectionStage,
  ContactChannel,
} from "@/lib/collectionStages";

const PATHS = [
  "/collections",
  "/email",
  "/sms",
  "/dues",
  "/members",
  "/dashboard",
];

function revalidateCollectionPaths() {
  for (const path of PATHS) revalidatePath(path);
}

function parseStage(value: unknown): CollectionStage {
  const raw = String(value ?? "");
  return (
    COLLECTION_STAGES.some((stage) => stage.value === raw)
      ? raw
      : "not_contacted"
  ) as CollectionStage;
}

function parseChannel(value: unknown): ContactChannel {
  const raw = String(value ?? "");
  return (
    CONTACT_CHANNELS.some((channel) => channel.value === raw)
      ? raw
      : "manual"
  ) as ContactChannel;
}

function memberIds(formData: FormData): number[] {
  const raw = String(formData.get("ids") ?? "");
  return raw
    .split(",")
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function insertContactEvent(
  db: ReturnType<typeof getDb>,
  userId: number,
  periodId: number,
  memberId: number,
  channel: ContactChannel,
  stage: CollectionStage
) {
  db.prepare(
    `INSERT INTO collection_events (
       user_id, period_id, member_id, channel, stage, event_status
     ) VALUES (?, ?, ?, ?, ?, 'logged')`
  ).run(userId, periodId, memberId, channel, stage);
}

export async function setPaymentInstructions(formData: FormData): Promise<void> {
  const user = await requireUser();
  const period = getActivePeriod(user.id);
  if (!period) {
    await setFlash("No active period to update.", "warn");
    return;
  }
  const instructions = String(formData.get("paymentInstructions") ?? "")
    .trim()
    .slice(0, 500);

  getDb()
    .prepare(
      "UPDATE periods SET collection_payment_instructions = ? WHERE id = ? AND user_id = ?"
    )
    .run(instructions, period.id, user.id);

  revalidateCollectionPaths();
}

export async function setMemberCollectionStage(formData: FormData): Promise<void> {
  const user = await requireUser();
  const period = getActivePeriod(user.id);
  const id = Number(formData.get("id"));
  if (!period || !id) {
    await setFlash("Couldn't update that member — try again.", "warn");
    return;
  }
  const stage = parseStage(formData.get("stage"));
  const paid = stage === "paid" ? 1 : 0;

  getDb()
    .prepare(
      `UPDATE members
       SET collection_stage = ?, dues_paid = ?
       WHERE id = ? AND user_id = ? AND period_id = ?`
    )
    .run(stage, paid, id, user.id, period.id);

  recomputeDerivedDues(user.id, period.id);

  revalidateCollectionPaths();
}

export async function setMembersCollectionStage(formData: FormData): Promise<void> {
  const user = await requireUser();
  const period = getActivePeriod(user.id);
  const ids = memberIds(formData);
  if (!period || ids.length === 0) {
    await setFlash("Select at least one member first.", "warn");
    return;
  }
  const stage = parseStage(formData.get("stage"));
  const paid = stage === "paid" ? 1 : 0;

  getDb()
    .prepare(
      `UPDATE members
       SET collection_stage = ?, dues_paid = ?
       WHERE user_id = ? AND period_id = ? AND id IN (${placeholders(ids.length)})`
    )
    .run(stage, paid, user.id, period.id, ...ids);

  recomputeDerivedDues(user.id, period.id);

  revalidateCollectionPaths();
}

export async function logMemberContact(formData: FormData): Promise<void> {
  const user = await requireUser();
  const period = getActivePeriod(user.id);
  const id = Number(formData.get("id"));
  if (!period || !id) {
    await setFlash("Couldn't log that contact — try again.", "warn");
    return;
  }
  const channel = parseChannel(formData.get("channel"));
  const stage = parseStage(formData.get("stage") ?? "reminder_sent");
  const db = getDb();

  db.transaction(() => {
    db.prepare(
      `UPDATE members
       SET contact_count = contact_count + 1,
           last_contacted_at = datetime('now'),
           last_contact_channel = ?,
           collection_stage = CASE
             WHEN collection_stage IN ('paid', 'payment_plan') THEN collection_stage
             ELSE ?
           END
       WHERE id = ? AND user_id = ? AND period_id = ?`
    )
    .run(channel, stage, id, user.id, period.id);
    insertContactEvent(db, user.id, period.id, id, channel, stage);
  })();

  revalidateCollectionPaths();
}

export async function logMembersContact(formData: FormData): Promise<void> {
  const user = await requireUser();
  const period = getActivePeriod(user.id);
  const ids = memberIds(formData);
  if (!period || ids.length === 0) {
    await setFlash("Select at least one member first.", "warn");
    return;
  }
  const channel = parseChannel(formData.get("channel"));
  const stage = parseStage(formData.get("stage") ?? "reminder_sent");
  const db = getDb();

  db.transaction(() => {
    db.prepare(
      `UPDATE members
       SET contact_count = contact_count + 1,
           last_contacted_at = datetime('now'),
           last_contact_channel = ?,
           collection_stage = CASE
             WHEN collection_stage IN ('paid', 'payment_plan') THEN collection_stage
             ELSE ?
           END
       WHERE user_id = ? AND period_id = ? AND id IN (${placeholders(ids.length)})`
    )
    .run(channel, stage, user.id, period.id, ...ids);
    for (const id of ids) {
      insertContactEvent(db, user.id, period.id, id, channel, stage);
    }
  })();

  revalidateCollectionPaths();
}
