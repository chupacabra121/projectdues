import { cookies } from "next/headers";

/**
 * One-shot toast messages via a short-lived cookie. A server action calls
 * `setFlash` on a silent no-op (bad input, missing record, …); after the
 * revalidate the AppShell reads it with `getFlash` and hands it to the Toaster,
 * which shows the message and clears the cookie so it can't replay.
 */

const FLASH_COOKIE = "sd-flash";

export type FlashTone = "info" | "warn" | "bad" | "good";

export interface FlashPayload {
  message: string;
  tone: FlashTone;
  /** Nonce so a repeated identical flash still re-triggers the toast. */
  t: number;
}

/** Queue a toast for the next render. Only the most recent flash survives. */
export async function setFlash(
  message: string,
  tone: FlashTone = "warn"
): Promise<void> {
  const store = await cookies();
  const payload: FlashPayload = { message, tone, t: Date.now() };
  store.set(FLASH_COOKIE, encodeURIComponent(JSON.stringify(payload)), {
    httpOnly: false, // the Toaster reads + clears it client-side
    sameSite: "lax",
    path: "/",
    maxAge: 120,
  });
}

/** Read (without consuming) the pending flash, if any. Call from a Server Component. */
export async function getFlash(): Promise<FlashPayload | null> {
  const raw = (await cookies()).get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const p = JSON.parse(decodeURIComponent(raw)) as FlashPayload;
    if (typeof p?.message === "string") return p;
  } catch {
    /* malformed — ignore */
  }
  return null;
}
