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

export function isRateLimited(key: string, now = Date.now()): boolean {
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  hits.set(key, timestamps);
  return timestamps.length > MAX_REQUESTS_PER_WINDOW;
}

/** Test-only: clears all tracked rate-limit state. */
export function __resetRateLimitForTests(): void {
  hits.clear();
}
