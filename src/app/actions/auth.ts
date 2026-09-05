"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { getDb, getSettings, UserRow } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";

export interface AuthState {
  error?: string;
  /**
   * Every non-secret field as typed, echoed back on a failed attempt. React
   * resets an uncontrolled form once its action settles, so without this the
   * fields blank out and the user retypes values that were already correct.
   */
  values?: Record<string, string>;
  /** Which input the error is about, so the page can put the cursor there. */
  field?: string;
}

/** The submitted fields worth echoing back — passwords are never among them. */
const SECRET_FIELDS = new Set(["password", "confirm_password"]);

function echo(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (SECRET_FIELDS.has(key) || typeof value !== "string") continue;
    out[key] = value.trim();
  }
  return out;
}

export async function signup(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const chapterName = String(formData.get("chapter_name") ?? "").trim();
  const firstName = String(formData.get("first_name") ?? "").trim().slice(0, 60);
  const lastName = String(formData.get("last_name") ?? "").trim().slice(0, 60);

  if (!firstName) return { error: "Enter your first name.", field: "first_name", values: echo(formData) };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: "Enter a valid email address.", field: "email", values: echo(formData) };
  if (password.length < 8)
    return {
      error: "Password must be at least 8 characters.",
      field: "password",
      values: echo(formData),
    };
  if (!chapterName) return {
    error: "Enter your chapter or organization name.",
    field: "chapter_name",
    values: echo(formData),
  };

  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return {
    error: "An account with that email already exists.",
    field: "email",
    values: echo(formData),
  };

  const hash = await bcrypt.hash(password, 10);
  const result = db
    .prepare(
      "INSERT INTO users (email, password_hash, chapter_name, first_name, last_name) VALUES (?, ?, ?, ?, ?)"
    )
    .run(email, hash, chapterName, firstName, lastName);

  await createSession(Number(result.lastInsertRowid));
  redirect("/onboarding");
}

export async function login(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = getDb()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email) as UserRow | undefined;
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return {
      error: "Invalid email or password.",
      field: "password",
      values: echo(formData),
    };

  await createSession(user.id);
  const settings = getSettings(user.id);
  redirect(settings?.onboarded ? "/dashboard" : "/onboarding");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
