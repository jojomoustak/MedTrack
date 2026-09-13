/**
 * Every `timestamptz` column in `lib/db/schema.ts` is declared with
 * `mode: "string"` (that file's own `timestamptz` helper) — drizzle-orm
 * hands back Postgres's own text representation of the value
 * ("2026-09-13 21:24:00+00"), not a parsed `Date` and not ISO 8601. Real
 * bug found live (2026-09-13, see `lib/domain/timestamp.ts` for the full
 * story): the client stores this value straight into Dexie next to
 * plenty of other same-field values that WERE generated locally via
 * `Date.prototype.toISOString()` ("2026-09-13T21:24:00.000Z"), and
 * several client call sites compared these strings directly — a mix of
 * formats a plain string comparison gets wrong.
 *
 * Fixes it at the one boundary every synced record crosses on the way
 * out (`changes.ts`'s pull-side `record`, `mutations.ts`'s mutation-ack
 * `serverRecord`, same "single choke point" precedent as `snake-case.ts`'s
 * `toCamelCaseRecord`) rather than at each of the — potentially many, and
 * growing — client-side comparison/sort sites: converts every string
 * value that looks like Postgres's timestamptz text output into a proper
 * ISO 8601 string, so the client only ever sees ONE format for any
 * timestamp field, matching what its own locally-generated values already
 * use.
 */
const POSTGRES_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:?\d{2})?)?$/;

export function normalizeTimestampsInRecord<T extends Record<string, unknown> | null | undefined>(record: T): T {
  if (!record) return record;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = typeof value === "string" && POSTGRES_TIMESTAMP_RE.test(value) ? new Date(value).toISOString() : value;
  }
  return result as T;
}
