"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  getDb,
  getActivePeriod,
  getPeriods,
  getSettings,
  periodNameFor,
  recomputeDerivedDues,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { setFlash } from "@/lib/flash";

const PATHS = ["/dashboard", "/budget", "/actuals", "/members", "/scenarios", "/periods"];

function revalidateAll() {
  for (const p of PATHS) revalidatePath(p);
}

function parseIso(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function setActivePeriod(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!id) {
    await setFlash("Couldn't switch periods — try again.", "warn");
    return;
  }
  const owned = getDb()
    .prepare("SELECT id FROM periods WHERE id = ? AND user_id = ?")
    .get(id, user.id);
  if (!owned) {
    await setFlash("That period isn't yours to open.", "warn");
    return;
  }
  getDb()
    .prepare("UPDATE settings SET active_period_id = ? WHERE user_id = ?")
    .run(id, user.id);
  revalidateAll();
}

export async function renamePeriod(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!id || !name) {
    await setFlash("Couldn't rename that period — try again.", "warn");
    return;
  }
  getDb()
    .prepare("UPDATE periods SET name = ? WHERE id = ? AND user_id = ?")
    .run(name, id, user.id);
  revalidateAll();
}

/**
 * Start a new budgeting period. Carry-over options copy what realistically
 * recurs each semester: the roster (dues reset, optionally pledges promoted),
 * fixed obligations (actuals cleared, monthly dates re-anchored), dues
 * settings, and allocation caps.
 */
export async function createPeriod(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = getDb();

  const start = parseIso(formData.get("start"));
  const end = parseIso(formData.get("end"));
  if (!start || !end || end <= start) {
    await setFlash("Pick a start date before the end date.", "warn");
    return;
  }
  const name =
    String(formData.get("name") ?? "").trim().slice(0, 60) ||
    periodNameFor(start);

  const carryRoster = formData.get("carry_roster") === "on";
  const promotePledges = formData.get("promote_pledges") === "on";
  const carryObligations = formData.get("carry_obligations") === "on";
  const carryActuals = formData.get("carry_actuals") === "on";
  const carrySettings = formData.get("carry_settings") === "on";
  const carryCaps = formData.get("carry_caps") === "on";

  const from = getActivePeriod(user.id);

  const create = db.transaction((): number => {
    const base = carrySettings && from ? from : null;
    // Custom categories are roster metadata: the carried members' tags reference
    // category ids, so the definitions must travel whenever the roster is carried
    // (even without carry_settings) — otherwise tier tags orphan and their dues
    // silently vanish. Carry them with either the settings OR the roster.
    const carriedCategories =
      (carrySettings || carryRoster) && from?.custom_categories?.length
        ? JSON.stringify(from.custom_categories)
        : null;
    const pid = Number(
      db
        .prepare(
          `INSERT INTO periods (
            user_id, name, semester_start, semester_end,
            active_members, current_pledges,
            pledges_conservative, pledges_expected, pledges_optimistic,
            active_dues, pledge_dues, collection_rate,
            starting_balance, dues_collected, reserve_target, dues_schedule,
            active_dues_breakdown, custom_categories
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`
        )
        .run(
          user.id,
          name,
          start,
          end,
          base?.active_members ?? 0,
          0,
          base?.pledges_conservative ?? 0,
          base?.pledges_expected ?? 0,
          base?.pledges_optimistic ?? 0,
          base?.active_dues ?? 0,
          base?.pledge_dues ?? 0,
          base?.collection_rate ?? 0.95,
          base?.reserve_target ?? 0,
          base?.dues_schedule ?? "sixweek",
          base?.active_dues_breakdown
            ? JSON.stringify(base.active_dues_breakdown)
            : null,
          carriedCategories
        ).lastInsertRowid
    );

    if (from && carryRoster) {
      const members = db
        .prepare("SELECT name, email, phone, status, tags FROM members WHERE user_id = ? AND period_id = ? AND status != 'trash'")
        .all(user.id, from.id) as { name: string; email: string; phone: string; status: string; tags: string }[];
      const insert = db.prepare(
        "INSERT INTO members (user_id, period_id, name, email, phone, status, tags) VALUES (?, ?, ?, ?, ?, ?, ?)"
      );
      for (const m of members) {
        const status = promotePledges ? "brother" : m.status;
        // Tags carry verbatim — category ids are stable because carrySettings
        // copies custom_categories as-is. Orphan ids (roster-without-settings)
        // are tolerated by every reader.
        insert.run(user.id, pid, m.name, m.email, m.phone, status, m.tags ?? "[]");
      }
      // Sync the headcount to the carried roster — but only when rows were
      // actually copied. An empty source roster (e.g. a "start from scratch"
      // chapter that tracks headcounts without names) must not stomp the
      // active_members value carry_settings just brought over with 0/0.
      if (members.length > 0) {
        const counts = db
          .prepare(
            "SELECT SUM(status='brother') AS a, SUM(status='pledge') AS p FROM members WHERE user_id = ? AND period_id = ?"
          )
          .get(user.id, pid) as { a: number; p: number };
        db.prepare(
          "UPDATE periods SET active_members = ?, current_pledges = ? WHERE id = ?"
        ).run(counts.a ?? 0, counts.p ?? 0, pid);
      }
    }

    if (from && carryObligations) {
      const items = db
        .prepare(
          "SELECT name, amount, actual_amount, date, frequency, category, notes FROM budget_items WHERE user_id = ? AND period_id = ? AND type = 'fixed_expense'"
        )
        .all(user.id, from.id) as {
        name: string; amount: number; actual_amount: number | null;
        date: string | null; frequency: string; category: string; notes: string;
      }[];
      const insert = db.prepare(
        `INSERT INTO budget_items (user_id, period_id, type, name, amount, actual_amount, date, frequency, category, attendance, notes)
         VALUES (?, ?, 'fixed_expense', ?, ?, NULL, ?, ?, ?, NULL, ?)`
      );
      for (const it of items) {
        // Monthly bills keep their day-of-month, re-anchored to the new
        // semester's first month; one-time items need fresh dates. Clamp the
        // day to the target month's length so we never fabricate 2026-09-31.
        let date: string | null = null;
        if (it.frequency === "monthly" && it.date) {
          const y = Number(start.slice(0, 4));
          const mo = Number(start.slice(5, 7)); // 1-based
          const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
          const day = Math.min(Number(it.date.slice(8, 10)) || 1, lastDay);
          date = `${start.slice(0, 7)}-${String(day).padStart(2, "0")}`;
        }
        // "Start from actuals": plan the new bill at what it really cost last
        // term (when recorded), so the budget learns instead of repeating the
        // same optimistic estimate. The new period's own actual starts blank.
        const planned =
          carryActuals && it.actual_amount != null ? it.actual_amount : it.amount;
        insert.run(user.id, pid, it.name, planned, date, it.frequency, it.category, it.notes);
      }
    }

    if (from && carryCaps) {
      db.prepare(
        `INSERT INTO category_caps (user_id, period_id, category, cap)
         SELECT user_id, ?, category, cap FROM category_caps WHERE user_id = ? AND period_id = ?`
      ).run(pid, user.id, from.id);
    }

    db.prepare("UPDATE settings SET active_period_id = ? WHERE user_id = ?").run(
      pid,
      user.id
    );
    return pid;
  });

  const newPid = create();
  // A carried roster comes over as full-dues (aid isn't copied), so re-derive
  // the active-dues breakdown from it rather than trusting the copied one.
  if (carryRoster) recomputeDerivedDues(user.id, newPid);
  revalidateAll();
  redirect("/dashboard");
}

export async function deletePeriod(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!id) {
    await setFlash("Couldn't delete that period — try again.", "warn");
    return;
  }
  const db = getDb();
  const all = getPeriods(user.id);
  if (all.length <= 1) {
    await setFlash("You can't delete your only period.", "warn");
    return;
  } // never delete the last period
  const target = all.find((p) => p.id === id);
  if (!target) {
    await setFlash("That period isn't yours to delete.", "warn");
    return;
  }

  const settings = getSettings(user.id);
  const wasActive = settings?.active_period_id === id;

  const wipe = db.transaction(() => {
    db.prepare("DELETE FROM budget_items WHERE user_id = ? AND period_id = ?").run(user.id, id);
    db.prepare("DELETE FROM members WHERE user_id = ? AND period_id = ?").run(user.id, id);
    db.prepare("DELETE FROM category_caps WHERE user_id = ? AND period_id = ?").run(user.id, id);
    db.prepare("DELETE FROM periods WHERE id = ? AND user_id = ?").run(id, user.id);
    // Only repoint the active period when we just deleted it — otherwise the
    // treasurer's current working period must stay put.
    if (wasActive) {
      const remaining = all.filter((p) => p.id !== id);
      db.prepare("UPDATE settings SET active_period_id = ? WHERE user_id = ?").run(
        remaining[0].id,
        user.id
      );
    }
  });
  wipe();
  revalidateAll();
}
