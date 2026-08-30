/**
 * `MedicationSchedule` (Phase 2 §2.6, Phase 10). Conflict strategy:
 * optimistic concurrency via `version`, same mechanism as `PurchaseList`/
 * `UserMedication`. The wall-clock/elapsed subtype split is real schema
 * (`medication_schedule_wall_clock`/`medication_schedule_elapsed`,
 * `lib/db/schema.ts`) server-side, but this client/wire-facing record
 * flattens both into one shape (data-architect design, 2026-08-30) — a
 * schedule mutation is one round trip, not two, and `timeAnchor` is
 * always DERIVED from `scheduleKind` (`deriveTimeAnchor` below), never
 * client-asserted, so a mismatched pairing can't even be constructed.
 */
import type { SyncableRecord } from "@/lib/domain/entities";

export const SCHEDULE_KINDS = ["daily", "multiple_times_daily", "specific_weekdays", "every_n_hours", "prn"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export type TimeAnchor = "wall_clock" | "elapsed";

/** `chk_anchor_matches_kind` (Phase 2 §2.6), expressed as a pure function so client and server derive the identical value from `scheduleKind` rather than trusting either side to send a matching pair. */
export function deriveTimeAnchor(scheduleKind: ScheduleKind): TimeAnchor | null {
  if (scheduleKind === "prn") return null;
  if (scheduleKind === "every_n_hours") return "elapsed";
  return "wall_clock";
}

/**
 * Bit `i` of `weekdaysMask` (only meaningful for `scheduleKind ===
 * "specific_weekdays"`) represents the weekday with `Date.getUTCDay()`
 * value `i` — bit 0 = Sunday, bit 1 = Monday, ... bit 6 = Saturday. A
 * self-contained convention (this codebase has no calendar library),
 * documented once here — every reader of `weekdaysMask` must agree with
 * this, not re-derive its own.
 */
export const WEEKDAY_BIT = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 } as const;

export interface MedicationScheduleRecord extends SyncableRecord {
  id: string;
  profileId: string;
  userMedicationId: string;
  scheduleKind: ScheduleKind;
  timeAnchor: TimeAnchor | null;
  /** "YYYY-MM-DD", interpreted in `timezone`. */
  startDate: string;
  endDate: string | null;
  /** IANA zone name (e.g. "Europe/Athens") — every wall-clock instant is computed against this, every DST transition included. */
  timezone: string;
  doseQuantityValue: string;
  doseQuantityUnit: string;
  /** Wall-clock subtype fields, flattened — non-null iff `timeAnchor === "wall_clock"`. "HH:MM:SS", local to `timezone`. */
  timesOfDay: string[] | null;
  /** Non-null only when `scheduleKind === "specific_weekdays"` (still nullable for daily/multiple_times_daily, which apply every day). */
  weekdaysMask: number | null;
  /** Elapsed subtype fields, flattened — non-null iff `timeAnchor === "elapsed"`. */
  intervalHours: number | null;
  /** ISO instant — the fixed UTC anchor an every-N-hours schedule counts from; deliberately never re-anchors on DST/timezone change (Phase 2 §2.6). */
  anchorAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
  clientMutationId: string;
}

export type CreateMedicationScheduleInput = Omit<
  MedicationScheduleRecord,
  "createdAt" | "updatedAt" | "version" | "deletedAt" | "syncState" | "timeAnchor"
>;

/** Fields a schedule EDIT can change. `scheduleKind` (and thus `timeAnchor`) is immutable — changing the kind is modeled as delete + create (data-architect design), never an in-place edit. */
export type MedicationSchedulePatch = Partial<
  Pick<
    MedicationScheduleRecord,
    "startDate" | "endDate" | "timezone" | "doseQuantityValue" | "doseQuantityUnit" | "timesOfDay" | "weekdaysMask" | "intervalHours" | "anchorAt"
  >
>;
