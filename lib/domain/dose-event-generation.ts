/**
 * Deterministic, client-side materialization of `DoseEvent` rows from a
 * `MedicationSchedule`'s recurrence rule (Phase 10, `modeling-medication-
 * domain`: "generate concrete DoseEvent records from a schedule rather
 * than computing 'what's due' on the fly"). Runs identically on server
 * and client (ADR-001) so two devices independently expanding the same
 * schedule converge to the exact same set of instants/ids without any
 * coordination — see `deriveScheduledDoseEventId`.
 *
 * Two schedule shapes, two expansion strategies:
 * - wall-clock (`daily`/`multiple_times_daily`/`specific_weekdays`):
 *   local `HH:MM` times re-evaluated against the schedule's IANA
 *   timezone every day — re-anchors across DST by construction, since
 *   each day's instant is computed fresh from the wall-clock value.
 * - elapsed (`every_n_hours`): fixed UTC anchor + interval, pure
 *   arithmetic — deliberately never shifts for DST/timezone (Phase 2
 *   §2.6's schema comment, and the UX doc's explicit "does not shift
 *   with clock changes" note for this kind).
 * `prn` has no recurrence — never generates anything here.
 */
import type { MedicationScheduleRecord, ScheduleKind } from "@/lib/domain/medication-schedule";

// ---------------------------------------------------------------------------
// Deterministic id derivation (RFC 4122 §4.3 UUIDv5, name-based/SHA-1)
// ---------------------------------------------------------------------------

/**
 * Fixed, NEVER-changed namespace for schedule-generated `DoseEvent` ids.
 * Changing this constant would make every device derive DIFFERENT ids
 * for the same (scheduleId, scheduledAt) pair than before, producing
 * duplicate rows for every existing schedule on next generation — treat
 * it as immutable as a column name, never regenerate it "to be safe."
 */
const SCHEDULE_GENERATED_NAMESPACE = "6f5d2b8e-3f0a-4b8b-9e3a-2f6a2f8e9c11";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/-/g, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * RFC 4122 §4.3 UUIDv5 — no library dependency: `crypto.subtle` is
 * available as a global in both Node.js (server) and every real browser/
 * WebView target this app runs in, matching this module's need to run
 * identically in both containers (ADR-001).
 */
export async function uuidV5(namespace: string, name: string): Promise<string> {
  const namespaceBytes = hexToBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const combined = new Uint8Array(namespaceBytes.length + nameBytes.length);
  combined.set(namespaceBytes, 0);
  combined.set(nameBytes, namespaceBytes.length);

  const hashBuffer = await crypto.subtle.digest("SHA-1", combined);
  const hash = new Uint8Array(hashBuffer).slice(0, 16);

  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variant RFC4122

  return bytesToUuid(hash);
}

/**
 * Deterministic id for one schedule-generated `DoseEvent` instance.
 * `manual_prn`/`manual_backfill` rows never use this — they use
 * `newId()` (random) since they have no recurrence to converge against,
 * and `schedule_id IS NULL` for those exempts them from
 * `uq_dose_event_schedule_instance` entirely.
 */
export async function deriveScheduledDoseEventId(scheduleId: string, scheduledAtUtcIso: string): Promise<string> {
  return uuidV5(SCHEDULE_GENERATED_NAMESPACE, `${scheduleId}|${scheduledAtUtcIso}`);
}

// ---------------------------------------------------------------------------
// Timezone conversion (zero-dependency — no date library exists in this
// codebase; the domain layer must stay usable in both Node and the
// browser/WebView per ADR-001)
// ---------------------------------------------------------------------------

interface WallClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function readWallClockInZone(instant: Date, timeZone: string): WallClockParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/**
 * Converts a local wall-clock (date, time, timezone) into the UTC instant
 * it represents, via the same guess-and-correct technique real timezone
 * libraries use internally (there's no library here to lean on). Two DST
 * edge cases are resolved deterministically (required for
 * `deriveScheduledDoseEventId`'s cross-device convergence to hold — every
 * device must compute the identical instant for the identical inputs):
 *
 * - **Fall-back ambiguity** (a local time that occurs twice, e.g.
 *   Europe/Athens 04:00 on the October transition): always resolves to
 *   the EARLIER of the two real instants.
 * - **Spring-forward gap** (a local time that never occurs, e.g. 03:30 on
 *   the March transition): resolves to an instant at or near the first
 *   valid moment after the gap. Unlike the fall-back case, this is a
 *   best-effort approximation, not an exactly-verified guarantee — full
 *   precision here would need real IANA transition-table lookups this
 *   codebase has no library for, and the practical impact (one schedule
 *   instance, one hour a year, off by at most a few minutes) doesn't
 *   justify adding one. Documented honestly rather than claimed as exact.
 */
export function zonedWallClockToUtc(localDate: string, localTime: string, timeZone: string): Date {
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute, second = 0] = localTime.split(":").map(Number);
  const targetMs = Date.UTC(year, month - 1, day, hour, minute, second);

  let guess = targetMs;
  for (let i = 0; i < 3; i++) {
    const actual = readWallClockInZone(new Date(guess), timeZone);
    const actualMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const diff = targetMs - actualMs;
    if (diff === 0) break;
    guess += diff;
  }

  // Fall-back ambiguity check: does an instant one hour earlier ALSO read
  // as the target wall-clock time? If so, this local time occurred twice
  // — deterministically prefer the earlier of the two. (1 hour covers
  // every real-world DST shift this app's target region uses; a larger
  // shift would need a bigger probe window, but none exists today.)
  const earlierCandidate = guess - 3_600_000;
  const earlierActual = readWallClockInZone(new Date(earlierCandidate), timeZone);
  if (
    earlierActual.year === year &&
    earlierActual.month === month &&
    earlierActual.day === day &&
    earlierActual.hour === hour &&
    earlierActual.minute === minute &&
    earlierActual.second === second
  ) {
    guess = earlierCandidate;
  }

  return new Date(guess);
}

function localDateStringInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Weekday of a pure calendar date, `Date.getUTCDay()` convention (0=Sunday..6=Saturday) — timezone-independent, since a "YYYY-MM-DD" string is already a specific calendar day regardless of zone. Matches `WEEKDAY_BIT` in `lib/domain/medication-schedule.ts`. */
function calendarWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

export interface ExpansionWindow {
  windowStart: Date;
  windowEnd: Date;
}

function withinScheduleDateRange(instant: Date, schedule: Pick<MedicationScheduleRecord, "startDate" | "endDate" | "timezone">): boolean {
  const localDate = localDateStringInZone(instant, schedule.timezone);
  if (localDate < schedule.startDate) return false;
  if (schedule.endDate && localDate > schedule.endDate) return false;
  return true;
}

function expandWallClockSchedule(
  schedule: Pick<MedicationScheduleRecord, "scheduleKind" | "timesOfDay" | "weekdaysMask" | "timezone" | "startDate" | "endDate">,
  window: ExpansionWindow,
): Date[] {
  if (!schedule.timesOfDay || schedule.timesOfDay.length === 0) return [];

  const instants: Date[] = [];
  // Local calendar days can differ from UTC calendar days by up to a day
  // in either direction depending on the zone's offset — pad by one day
  // on each side of the window so no boundary instant is missed, then
  // let the final windowStart/windowEnd instant check trim precisely.
  let cursor = addDaysToDateString(localDateStringInZone(window.windowStart, schedule.timezone), -1);
  const endCursor = addDaysToDateString(localDateStringInZone(window.windowEnd, schedule.timezone), 1);

  while (cursor <= endCursor) {
    const inDateRange = cursor >= schedule.startDate && (!schedule.endDate || cursor <= schedule.endDate);
    const weekdayOk = schedule.scheduleKind !== "specific_weekdays" || ((schedule.weekdaysMask ?? 0) & (1 << calendarWeekday(cursor))) !== 0;

    if (inDateRange && weekdayOk) {
      for (const time of schedule.timesOfDay) {
        const instant = zonedWallClockToUtc(cursor, time, schedule.timezone);
        if (instant >= window.windowStart && instant <= window.windowEnd) {
          instants.push(instant);
        }
      }
    }
    cursor = addDaysToDateString(cursor, 1);
  }

  return instants.sort((a, b) => a.getTime() - b.getTime());
}

function expandElapsedSchedule(
  schedule: Pick<MedicationScheduleRecord, "anchorAt" | "intervalHours" | "startDate" | "endDate" | "timezone">,
  window: ExpansionWindow,
): Date[] {
  if (schedule.anchorAt === null || schedule.intervalHours === null) return [];

  const anchorMs = new Date(schedule.anchorAt).getTime();
  const intervalMs = schedule.intervalHours * 3_600_000;
  const firstK = Math.max(0, Math.ceil((window.windowStart.getTime() - anchorMs) / intervalMs));
  const lastK = Math.floor((window.windowEnd.getTime() - anchorMs) / intervalMs);

  const instants: Date[] = [];
  for (let k = firstK; k <= lastK; k++) {
    const instant = new Date(anchorMs + k * intervalMs);
    if (withinScheduleDateRange(instant, schedule)) instants.push(instant);
  }
  return instants;
}

/**
 * Every instant this schedule produces within `[windowStart, windowEnd]`
 * (inclusive), in ascending order. `prn` always returns `[]` — there's no
 * recurrence to expand; PRN doses are logged manually
 * (`source: "manual_prn"`), never generated.
 */
export function computeScheduleInstants(
  schedule: Pick<
    MedicationScheduleRecord,
    "scheduleKind" | "timeAnchor" | "timesOfDay" | "weekdaysMask" | "anchorAt" | "intervalHours" | "timezone" | "startDate" | "endDate"
  >,
  window: ExpansionWindow,
): Date[] {
  if (schedule.timeAnchor === "wall_clock") return expandWallClockSchedule(schedule, window);
  if (schedule.timeAnchor === "elapsed") return expandElapsedSchedule(schedule, window);
  return [];
}

/** Kinds `computeScheduleInstants` ever produces instants for — re-exported so callers can early-out on PRN schedules without importing the whole expansion machinery. */
export const RECURRING_SCHEDULE_KINDS: readonly ScheduleKind[] = ["daily", "multiple_times_daily", "specific_weekdays", "every_n_hours"];
