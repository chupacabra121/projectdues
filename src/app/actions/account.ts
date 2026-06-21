"use server";

import { revalidatePath } from "next/cache";
import { getDb, UserPreferences } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export interface AccountPayload {
  firstName: string;
  lastName: string;
  phone: string;
  title: string;
  chapterName: string;
  preferences: UserPreferences;
}

const clamp = (v: string, n: number) => String(v ?? "").trim().slice(0, n);

/**
 * Save the account / settings page. The profile + contact fields are real
 * columns; the rest of the preferences are stored as JSON (they persist, but
 * several are placeholders that don't yet drive behavior). The login email is
 * deliberately not editable here — it's the sign-in identity.
 */
export async function updateAccount(payload: AccountPayload): Promise<void> {
  const user = await requireUser();
  const firstName = clamp(payload.firstName, 60);
  const lastName = clamp(payload.lastName, 60);
  const phone = clamp(payload.phone, 40);
  const title = clamp(payload.title, 60);
  const chapterName = clamp(payload.chapterName, 80) || user.chapter_name;
  const preferences = JSON.stringify(payload.preferences ?? {});

  getDb()
    .prepare(
      `UPDATE users SET first_name = ?, last_name = ?, phone = ?, title = ?,
        chapter_name = ?, preferences = ? WHERE id = ?`
    )
    .run(firstName, lastName, phone, title, chapterName, preferences, user.id);

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}
