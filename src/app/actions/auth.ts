"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { getDb, getSettings, UserRow } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export interface AuthState {
  error?: string;
}

/** Generic, account-existence-neutral throttle message. */
const THROTTLED = "Too many attempts — wait a minute and try again.";

export async function signup(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const ip = await clientIp();
  if (!rateLimit(`signup:${ip}`, 10, 60_000)) return { error: THROTTLED };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const chapterName = String(formData.get("chapter_name") ?? "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: "Enter a valid email address." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };
  if (!chapterName) return { error: "Enter your chapter or organization name." };

  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return { error: "An account with that email already exists." };

  const hash = await bcrypt.hash(password, 10);
  const result = db
    .prepare(
      "INSERT INTO users (email, password_hash, chapter_name) VALUES (?, ?, ?)"
    )
    .run(email, hash, chapterName);

  await createSession(Number(result.lastInsertRowid));
  redirect("/onboarding");
}

export async function login(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const ip = await clientIp();
  // Check the throttle BEFORE the bcrypt compare so a flood can't burn CPU.
  if (!rateLimit(`login:${ip}`, 10, 60_000)) return { error: THROTTLED };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = getDb()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email) as UserRow | undefined;
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return { error: "Invalid email or password." };

  await createSession(user.id);
  const settings = getSettings(user.id);
  redirect(settings?.onboarded ? "/dashboard" : "/onboarding");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
