import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";

const WEEKDAY_SHORT = ["Κυρ", "Δευ", "Τρί", "Τετ", "Πέμ", "Παρ", "Σάβ"];
/** Monday-first, the way a Greek week reads. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function timesPerDay(count: number): string {
  return count === 1 ? "1 φορά την ημέρα" : `${count} φορές την ημέρα`;
}

/** "Δευ, Τετ, Παρ" (Monday-first), or "κάθε μέρα" for all seven. */
export function describeWeekdays(mask: number): string {
  const days = WEEK_ORDER.filter((bit) => (mask & (1 << bit)) !== 0).map((bit) => WEEKDAY_SHORT[bit]);
  return days.length === 7 ? "κάθε μέρα" : days.join(", ");
}

/** Whether a schedule is still running on `today` ("YYYY-MM-DD"). */
export function isScheduleCurrent(schedule: Pick<MedicationScheduleRecord, "deletedAt" | "endDate">, today: string): boolean {
  return schedule.deletedAt === null && (schedule.endDate === null || schedule.endDate >= today);
}

/**
 * One-line description of how often a schedule runs — the reference
 * mockup's "2 times daily" line on the Medications list. Describes what
 * the user entered, never a recommendation.
 */
export function describeSchedule(schedule: Pick<MedicationScheduleRecord, "scheduleKind" | "timesOfDay" | "weekdaysMask" | "intervalHours">): string {
  switch (schedule.scheduleKind) {
    case "daily":
    case "multiple_times_daily":
      return timesPerDay(Math.max(1, schedule.timesOfDay?.length ?? 1));
    case "specific_weekdays": {
      const count = schedule.timesOfDay?.length ?? 1;
      const dayList = describeWeekdays(schedule.weekdaysMask ?? 0);
      return count > 1 ? `${count} φορές · ${dayList}` : dayList;
    }
    case "every_n_hours":
      return schedule.intervalHours === 1 ? "Κάθε ώρα" : `Κάθε ${schedule.intervalHours ?? "?"} ώρες`;
    case "prn":
      return "Όταν χρειάζεται";
  }
}

/**
 * The summary for one medication: its earliest-created schedule that's
 * still running, "+N" when it has more than one. Null when it has none.
 */
export function summarizeSchedules(schedules: MedicationScheduleRecord[], today: string): string | null {
  const current = schedules.filter((s) => isScheduleCurrent(s, today)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (current.length === 0) return null;
  const first = describeSchedule(current[0]);
  return current.length > 1 ? `${first} +${current.length - 1}` : first;
}
