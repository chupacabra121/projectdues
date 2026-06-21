import { headers } from "next/headers";

/**
 * In-process fixed-window rate limiter. Lives in module scope, so it is shared
 * across requests within a single server instance — enough to blunt credential
 * stuffing / signup floods on a single-node deployment. For multi-instance
 * hosting, back this with Redis or the platform's edge limiter.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const GC_AT = 10_000; // prune once the map grows this large

/**
 * Returns true when the caller is within `limit` actions per `windowMs`, false
 * once over. The first call in a fresh window counts as 1 and is always allowed
 * (so a limit of N permits N calls, then denies).
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  if (buckets.size > GC_AT) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

/**
 * Best-effort client IP from proxy headers. `x-forwarded-for` is set by the
 * hosting proxy (Vercel, nginx, …); the first hop is the originating client.
 * Falls back to a shared bucket when no proxy header is present.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}
