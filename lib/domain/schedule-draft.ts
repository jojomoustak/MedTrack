/**
 * The Add Medication schedule step's in-progress form output (Phase 3
 * §2.5) — deliberately NOT a `MedicationScheduleRecord`: it has no `id`/
 * `profileId`/`userMedicationId`/`clientMutationId` yet, since those only
 * exist once the owning `UserMedication` itself has been created
 * (`AddMedicationFlow.handleFinish`, ux-accessibility-designer design,
 * 2026-08-30). `null` (not this type) means "skipped — no schedule yet."
 */
import type { ScheduleKind } from "@/lib/domain/medication-schedule";

export interface ScheduleDraft {
  scheduleKind: ScheduleKind;
  startDate: string;
  endDate: string | null;
  timezone: string;
  doseQuantityValue: string;
  doseQuantityUnit: string;
  timesOfDay: string[] | null;
  weekdaysMask: number | null;
  intervalHours: number | null;
  anchorAt: string | null;
}

/**
 * `scheduleKind` for a wall-clock schedule is DERIVED, never chosen
 * directly (design doc) — selecting all 7 weekdays is normalized to
 * "every day" (`weekdaysMask: null`, kind `daily`/`multiple_times_daily`),
 * matching `weekdaysMask`'s own doc comment: "non-null only when
 * scheduleKind === specific_weekdays".
 */
export function deriveWallClockScheduleKind(timesOfDay: string[], weekdaysMask: number | null): ScheduleKind {
  if (weekdaysMask !== null) return "specific_weekdays";
  return timesOfDay.length > 1 ? "multiple_times_daily" : "daily";
}

/** All 7 `WEEKDAY_BIT` bits set (0b1111111) — selecting every day normalizes to `weekdaysMask: null`, never this value (see `deriveWallClockScheduleKind`). */
export const ALL_WEEKDAYS_MASK = 0b1111111;
