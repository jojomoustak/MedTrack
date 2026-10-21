import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";
import type { Language } from "@/lib/i18n/language";

const WEEKDAY_SHORT: Record<Language, string[]> = {
  el: ["Κυρ", "Δευ", "Τρί", "Τετ", "Πέμ", "Παρ", "Σάβ"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
/** Monday-first, the way a Greek week reads (and a British one). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function timesPerDay(count: number, language: Language): string {
  if (language === "en") return count === 1 ? "Once a day" : count === 2 ? "Twice a day" : `${count} times a day`;
  return count === 1 ? "1 φορά την ημέρα" : `${count} φορές την ημέρα`;
}

/** "Δευ, Τετ, Παρ" (Monday-first), or "κάθε μέρα" for all seven — "Mon, Wed, Fri" / "every day" in English. */
export function describeWeekdays(mask: number, language: Language = "el"): string {
  const days = WEEK_ORDER.filter((bit) => (mask & (1 << bit)) !== 0).map((bit) => WEEKDAY_SHORT[language][bit]);
  if (days.length === 7) return language === "en" ? "every day" : "κάθε μέρα";
  return days.join(", ");
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
export function describeSchedule(
  schedule: Pick<MedicationScheduleRecord, "scheduleKind" | "timesOfDay" | "weekdaysMask" | "intervalHours">,
  language: Language = "el",
): string {
  const en = language === "en";
  switch (schedule.scheduleKind) {
    case "daily":
    case "multiple_times_daily":
      return timesPerDay(Math.max(1, schedule.timesOfDay?.length ?? 1), language);
    case "specific_weekdays": {
      const count = schedule.timesOfDay?.length ?? 1;
      const dayList = describeWeekdays(schedule.weekdaysMask ?? 0, language);
      return count > 1 ? `${count} ${en ? "times" : "φορές"} · ${dayList}` : dayList;
    }
    case "every_n_hours":
      if (schedule.intervalHours === 1) return en ? "Every hour" : "Κάθε ώρα";
      return en ? `Every ${schedule.intervalHours ?? "?"} hours` : `Κάθε ${schedule.intervalHours ?? "?"} ώρες`;
    case "prn":
      return en ? "As needed" : "Όταν χρειάζεται";
  }
}

/**
 * The summary for one medication: its earliest-created schedule that's
 * still running, "+N" when it has more than one. Null when it has none.
 */
export function summarizeSchedules(schedules: MedicationScheduleRecord[], today: string, language: Language = "el"): string | null {
  const current = schedules.filter((s) => isScheduleCurrent(s, today)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (current.length === 0) return null;
  const first = describeSchedule(current[0], language);
  return current.length > 1 ? `${first} +${current.length - 1}` : first;
}
