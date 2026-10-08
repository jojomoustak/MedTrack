import { describe, expect, it } from "vitest";
import { describeSchedule, summarizeSchedules } from "@/lib/medications/schedule-summary";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";

function schedule(overrides: Partial<MedicationScheduleRecord>): MedicationScheduleRecord {
  return {
    id: crypto.randomUUID(),
    profileId: "p",
    userMedicationId: "m",
    scheduleKind: "daily",
    timeAnchor: "wall_clock",
    startDate: "2026-01-01",
    endDate: null,
    timezone: "Europe/Athens",
    doseQuantityValue: "1",
    doseQuantityUnit: "tablet",
    timesOfDay: ["08:00:00"],
    weekdaysMask: null,
    intervalHours: null,
    anchorAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    deletedAt: null,
    clientMutationId: "c",
    syncState: "synced",
    ...overrides,
  };
}

describe("describeSchedule", () => {
  it("counts times per day", () => {
    expect(describeSchedule(schedule({ scheduleKind: "daily", timesOfDay: ["08:00:00"] }))).toBe("1 φορά την ημέρα");
    expect(describeSchedule(schedule({ scheduleKind: "multiple_times_daily", timesOfDay: ["08:00:00", "20:00:00"] }))).toBe("2 φορές την ημέρα");
  });

  it("lists weekdays Monday-first", () => {
    // Sunday (bit 0) + Monday (bit 1) + Wednesday (bit 3)
    expect(describeSchedule(schedule({ scheduleKind: "specific_weekdays", weekdaysMask: 0b0001011 }))).toBe("Δευ, Τετ, Κυρ");
    expect(describeSchedule(schedule({ scheduleKind: "specific_weekdays", weekdaysMask: 0b0000010, timesOfDay: ["08:00:00", "20:00:00"] }))).toBe("2 φορές · Δευ");
    expect(describeSchedule(schedule({ scheduleKind: "specific_weekdays", weekdaysMask: 0b1111111 }))).toBe("κάθε μέρα");
  });

  it("describes interval and as-needed schedules", () => {
    expect(describeSchedule(schedule({ scheduleKind: "every_n_hours", timeAnchor: "elapsed", timesOfDay: null, intervalHours: 8 }))).toBe("Κάθε 8 ώρες");
    expect(describeSchedule(schedule({ scheduleKind: "prn", timeAnchor: null, timesOfDay: null }))).toBe("Όταν χρειάζεται");
  });
});

describe("summarizeSchedules", () => {
  it("ignores deleted and ended schedules", () => {
    expect(summarizeSchedules([schedule({ deletedAt: "2026-02-01T00:00:00.000Z" }), schedule({ endDate: "2026-03-01" })], "2026-10-05")).toBeNull();
  });

  it("keeps a schedule that ends today", () => {
    expect(summarizeSchedules([schedule({ endDate: "2026-10-05" })], "2026-10-05")).toBe("1 φορά την ημέρα");
  });

  it("uses the earliest current schedule and counts the rest", () => {
    const later = schedule({ createdAt: "2026-05-01T00:00:00.000Z", scheduleKind: "prn", timesOfDay: null });
    const earlier = schedule({ createdAt: "2026-02-01T00:00:00.000Z", timesOfDay: ["08:00:00", "20:00:00"], scheduleKind: "multiple_times_daily" });
    expect(summarizeSchedules([later, earlier], "2026-10-05")).toBe("2 φορές την ημέρα +1");
  });
});
