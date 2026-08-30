/**
 * Every raw `db.execute(sql\`...\`)` query result in `lib/sync/server/`
 * comes back with Postgres's actual column names (snake_case) —
 * Drizzle's automatic camelCase mapping only applies to its own query
 * builder (`.select().from(...)`), never to raw SQL. A real bug found
 * via live-device testing (2026-08-30, Phase 10): every
 * `DexieXxxRepository.applyRemote()` just `put()`s a server record
 * straight into Dexie with no conversion, so after a successful mutation
 * ack the local record's fields got silently replaced with useless
 * snake_case keys (`scheduledAt` became `undefined`, the real value sat
 * under the now-unread `scheduled_at` instead) — invisible until now
 * only because the one other entity built on raw SQL (`purchaseList`,
 * since Phase 5) has never had its synced data actually displayed by
 * any UI yet. Shared by `mutations.ts` (mutation-ack `serverRecord`) and
 * `changes.ts` (pull-side hydrated `record`) — every raw-SQL result
 * either module returns to a client must go through this first.
 */
export function toCamelCaseRecord(obj: Record<string, unknown> | null | undefined): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}
