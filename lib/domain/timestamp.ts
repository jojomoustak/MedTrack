/**
 * Every timestamp string in this app SHOULD be ISO 8601
 * ("2026-09-13T21:24:00.000Z"), but Postgres's own `timestamptz` text
 * output ("2026-09-13 21:24:00+00" — a space instead of "T", no
 * milliseconds) can ride along unmodified through the sync layer for any
 * server-round-tripped record that predates `lib/sync/server/
 * normalize-timestamps.ts`'s fix, or any future column this project adds
 * without remembering to normalize it there.
 *
 * Real bug found live (2026-09-13): several call sites compared two such
 * strings directly with `<`/`>=`/`<=`. Since the ASCII space character
 * (0x20) sorts before `T` (0x54), a Postgres-format string on the SAME
 * calendar date as an ISO string it's compared against always sorted as
 * "earlier", no matter what time of day it actually represented — a
 * different calendar date happened to compare correctly by coincidence
 * (the date digits alone decided it), which is why this went unnoticed
 * until a same-day case was actually hit live. `sweepMissedDoseEvents`
 * was hit hardest: any dose scheduled later TODAY, once synced down from
 * the server, looked "already overdue" the moment the sweep next ran,
 * silently transitioning it to `missed` and cancelling its native
 * reminder alarm hours before it was ever due — CLAUDE.md rule 3 (native
 * reminder reliability) broken by a string-formatting mismatch, not by
 * anything AlarmManager-related.
 *
 * These helpers parse through `Date` instead of comparing raw strings —
 * correct regardless of which of the two formats either side happens to
 * be in, so callers stay correct even if a future column is accidentally
 * left unnormalized upstream.
 */
export function parseTimestampMs(iso: string): number {
  return new Date(iso).getTime();
}

export function isTimestampBefore(a: string, b: string): boolean {
  return parseTimestampMs(a) < parseTimestampMs(b);
}

export function isTimestampAtOrBefore(a: string, b: string): boolean {
  return parseTimestampMs(a) <= parseTimestampMs(b);
}

export function isTimestampAtOrAfter(a: string, b: string): boolean {
  return parseTimestampMs(a) >= parseTimestampMs(b);
}

export function compareTimestampsAscending(a: string, b: string): number {
  return parseTimestampMs(a) - parseTimestampMs(b);
}
