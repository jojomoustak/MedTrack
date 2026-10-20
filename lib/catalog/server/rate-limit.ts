/**
 * Minimal in-memory sliding-window rate limiter for the catalog search
 * endpoint — an MVP-appropriate mechanism (single-instance Vercel
 * Function memory), not a distributed limiter. Good enough to stop a
 * single client from hammering `pg_trgm` search with every keystroke;
 * revisit with a shared store (e.g. Redis/Upstash) if the app ever runs
 * genuinely multi-instance and this needs to be authoritative across
 * instances rather than per-instance best-effort.
 */
const WINDOW_MS = 10_000;
const MAX_REQUESTS_PER_WINDOW = 20;

const hits = new Map<string, number[]>();

/** `limit`: a route's own window and count, when the search defaults are too loose for it (e.g. image uploads). */
export function isRateLimited(key: string, now = Date.now(), limit: { windowMs: number; max: number } = { windowMs: WINDOW_MS, max: MAX_REQUESTS_PER_WINDOW }): boolean {
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < limit.windowMs);
  timestamps.push(now);
  hits.set(key, timestamps);
  return timestamps.length > limit.max;
}

/** Test-only: clears all tracked rate-limit state. */
export function __resetRateLimitForTests(): void {
  hits.clear();
}
