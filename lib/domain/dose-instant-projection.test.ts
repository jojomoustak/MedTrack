import { describe, expect, it } from "vitest";
import { projectDoseInstantsForRange } from "@/lib/domain/dose-instant-projection";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";

function dailySchedule(overrides: Partial<MedicationScheduleRecord> = {}): MedicationScheduleRecord {
  return {
    id: "schedule-1",
    profileId: "profile-1",
    userMedicationId: "med-1",
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
    clientMutationId: "cmid-1",
    syncState: "synced",
    ...overrides,
  };
}

describe("projectDoseInstantsForRange", () => {
  it("projects one instant per day for a daily wall-clock schedule", () => {
    const from = new Date("2026-09-10T00:00:00Z");
    const to = new Date("2026-09-13T23:59:59Z");

    const projected = projectDoseInstantsForRange([dailySchedule()], from, to);

    expect(projected).toHaveLength(4); // Sep 10, 11, 12, 13
    expect(projected[0]).toEqual({
      scheduleId: "schedule-1",
      userMedicationId: "med-1",
      scheduledAt: expect.stringMatching(/^2026-09-10T/),
    });
  });

  it("never returns a DoseEventRecord-shaped object — no id/status field exists to accidentally act on", () => {
    const from = new Date("2026-09-10T00:00:00Z");
    const to = new Date("2026-09-10T23:59:59Z");

    const [projected] = projectDoseInstantsForRange([dailySchedule()], from, to);

    expect(projected).not.toHaveProperty("id");
    expect(projected).not.toHaveProperty("status");
    expect(Object.keys(projected).sort()).toEqual(["scheduleId", "scheduledAt", "userMedicationId"]);
  });

  it("skips a soft-deleted schedule", () => {
    const from = new Date("2026-09-10T00:00:00Z");
    const to = new Date("2026-09-10T23:59:59Z");

    const projected = projectDoseInstantsForRange([dailySchedule({ deletedAt: "2026-09-05T00:00:00.000Z" })], from, to);

    expect(projected).toEqual([]);
  });

  it("skips a PRN schedule — no recurrence to project", () => {
    const from = new Date("2026-09-10T00:00:00Z");
    const to = new Date("2026-09-10T23:59:59Z");

    const projected = projectDoseInstantsForRange(
      [dailySchedule({ scheduleKind: "prn", timeAnchor: null, timesOfDay: null })],
      from,
      to,
    );

    expect(projected).toEqual([]);
  });

  it("merges and sorts instants across multiple schedules ascending", () => {
    const from = new Date("2026-09-10T00:00:00Z");
    const to = new Date("2026-09-10T23:59:59Z");
    const late = dailySchedule({ id: "schedule-late", timesOfDay: ["20:00:00"] });
    const early = dailySchedule({ id: "schedule-early", timesOfDay: ["06:00:00"] });

    const projected = projectDoseInstantsForRange([late, early], from, to);

    expect(projected.map((p) => p.scheduleId)).toEqual(["schedule-early", "schedule-late"]);
  });

  it("respects the schedule's own date range — nothing projected before startDate or after endDate", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const to = new Date("2026-09-30T23:59:59Z");

    const projected = projectDoseInstantsForRange([dailySchedule({ startDate: "2026-09-15", endDate: "2026-09-16" })], from, to);

    const dates = projected.map((p) => p.scheduledAt.slice(0, 10));
    expect(dates.every((d) => d >= "2026-09-14")).toBe(true); // UTC offset from Athens local can land on the 14th
    expect(dates.every((d) => d <= "2026-09-16")).toBe(true);
    expect(projected.length).toBeGreaterThan(0);
  });
});
