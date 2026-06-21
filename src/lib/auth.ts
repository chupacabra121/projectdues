import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, getSettings, UserRow } from "./db";

const COOKIE_NAME = "simpledues_session";

// Resolved lazily (on first auth request) so `next build`'s page-data
// collection — which imports this module but never signs a token — doesn't trip
// the guard. At request time in production we refuse to run with the public dev
// secret, since anyone could then forge a session for any userId.
let cachedSecret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error(
      "SESSION_SECRET must be set in production. Generate one with: openssl rand -hex 32"
    );
  }
  cachedSecret = new TextEncoder().encode(
    process.env.SESSION_SECRET ?? "simpledues-dev-secret-change-in-production"
  );
  return cachedSecret;
}

export async function createSession(userId: number): Promise<void> {
  const token = await new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
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
    const { payload } = await jwtVerify(token, getSecret());
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
