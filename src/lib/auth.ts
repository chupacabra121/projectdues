import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, getSettings, UserRow } from "./db";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "chapteros-dev-secret-change-in-production"
);
const COOKIE_NAME = "chapteros_session";

export async function createSession(userId: number): Promise<void> {
  const token = await new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<UserRow | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const id = Number(payload.sub);
    const user = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as
      | UserRow
      | undefined;
    return user ?? null;
  } catch {
    return null;
  }
}

/** Redirects to /login when signed out; to /onboarding when not yet set up. */
export async function requireOnboardedUser(): Promise<UserRow> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const settings = getSettings(user.id);
  if (!settings?.onboarded) redirect("/onboarding");
  return user;
}

export async function requireUser(): Promise<UserRow> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
