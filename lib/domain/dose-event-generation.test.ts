import { describe, expect, it } from "vitest";
import { computeScheduleInstants, deriveScheduledDoseEventId, uuidV5, zonedWallClockToUtc } from "@/lib/domain/dose-event-generation";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";

function baseSchedule(overrides: Partial<MedicationScheduleRecord> = {}): Pick<
  MedicationScheduleRecord,
  "scheduleKind" | "timeAnchor" | "timesOfDay" | "weekdaysMask" | "anchorAt" | "intervalHours" | "timezone" | "startDate" | "endDate"
> {
  return {
    scheduleKind: "daily",
    timeAnchor: "wall_clock",
    timesOfDay: ["08:00:00"],
    weekdaysMask: null,
    anchorAt: null,
    intervalHours: null,
    timezone: "Europe/Athens",
    startDate: "2026-01-01",
    endDate: null,
    ...overrides,
  };
}

describe("uuidV5 / deriveScheduledDoseEventId", () => {
  it("is deterministic — the same inputs always produce the same id", async () => {
    const a = await deriveScheduledDoseEventId("schedule-1", "2026-09-01T05:00:00.000Z");
    const b = await deriveScheduledDoseEventId("schedule-1", "2026-09-01T05:00:00.000Z");
    expect(a).toBe(b);
  });

  it("produces different ids for different inputs", async () => {
    const a = await deriveScheduledDoseEventId("schedule-1", "2026-09-01T05:00:00.000Z");
    const b = await deriveScheduledDoseEventId("schedule-2", "2026-09-01T05:00:00.000Z");
    const c = await deriveScheduledDoseEventId("schedule-1", "2026-09-02T05:00:00.000Z");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("produces a well-formed UUIDv5 (version and variant bits set correctly)", async () => {
    const id = await uuidV5("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "example.com");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("zonedWallClockToUtc", () => {
  it("converts a plain (non-DST-boundary) local time correctly", () => {
    // Europe/Athens is EET (UTC+2) in January.
    const instant = zonedWallClockToUtc("2026-01-15", "08:00:00", "Europe/Athens");
    expect(instant.toISOString()).toBe("2026-01-15T06:00:00.000Z");
  });

  it("converts a summer local time correctly (EEST, UTC+3)", () => {
    const instant = zonedWallClockToUtc("2026-07-15", "08:00:00", "Europe/Athens");
    expect(instant.toISOString()).toBe("2026-07-15T05:00:00.000Z");
  });

  it("resolves a fall-back-ambiguous local time to the EARLIER of its two real instants", () => {
    // 2024-10-27: Europe/Athens clocks moved back from 04:00 EEST to
    // 03:00 EET. Local 03:30 occurred twice — once at 00:30 UTC (EEST,
    // UTC+3) and once at 01:30 UTC (EET, UTC+2). Must resolve to the
    // earlier one (00:30 UTC).
    const instant = zonedWallClockToUtc("2024-10-27", "03:30:00", "Europe/Athens");
    expect(instant.toISOString()).toBe("2024-10-27T00:30:00.000Z");
  });

  it("resolves a spring-forward local time near the gap to a valid instant after it", () => {
    // 2024-03-31: Europe/Athens clocks jumped from 03:00 EET straight to
    // 04:00 EEST. Local 03:30 never existed. Must not throw, and must
    // land at/after the transition (i.e. treat it as EEST, UTC+3).
    const instant = zonedWallClockToUtc("2024-03-31", "03:30:00", "Europe/Athens");
    expect(instant.toISOString()).toBe("2024-03-31T00:30:00.000Z");
  });
});

describe("computeScheduleInstants", () => {
  it("returns nothing for a PRN schedule regardless of window", () => {
    const schedule = baseSchedule({ scheduleKind: "prn", timeAnchor: null, timesOfDay: null });
    const instants = computeScheduleInstants(schedule, {
      windowStart: new Date("2026-09-01T00:00:00Z"),
      windowEnd: new Date("2026-09-05T00:00:00Z"),
    });
    expect(instants).toEqual([]);
  });

  it("expands a daily wall-clock schedule to one instant per day within the window", () => {
    const schedule = baseSchedule({ timesOfDay: ["08:00:00"] });
    const instants = computeScheduleInstants(schedule, {
      windowStart: new Date("2026-09-01T00:00:00Z"),
      windowEnd: new Date("2026-09-03T23:59:59Z"),
    });
    expect(instants.map((d) => d.toISOString())).toEqual(["2026-09-01T05:00:00.000Z", "2026-09-02T05:00:00.000Z", "2026-09-03T05:00:00.000Z"]);
  });

  it("expands multiple_times_daily to every time-of-day, every day", () => {
    const schedule = baseSchedule({ scheduleKind: "multiple_times_daily", timesOfDay: ["08:00:00", "20:00:00"] });
    const instants = computeScheduleInstants(schedule, {
      windowStart: new Date("2026-09-01T00:00:00Z"),
      windowEnd: new Date("2026-09-01T23:59:59Z"),
    });
    expect(instants.map((d) => d.toISOString())).toEqual(["2026-09-01T05:00:00.000Z", "2026-09-01T17:00:00.000Z"]);
  });

  it("respects specific_weekdays — only matching weekdays produce instants", () => {
    // 2026-09-01 is a Tuesday. weekdaysMask bit 2 = Tuesday only.
    const schedule = baseSchedule({ scheduleKind: "specific_weekdays", weekdaysMask: 1 << 2, timesOfDay: ["08:00:00"] });
    const instants = computeScheduleInstants(schedule, {
      windowStart: new Date("2026-09-01T00:00:00Z"),
      windowEnd: new Date("2026-09-07T23:59:59Z"),
    });
    expect(instants).toHaveLength(1);
    expect(instants[0].toISOString()).toBe("2026-09-01T05:00:00.000Z");
  });

  it("excludes instants before startDate or after endDate", () => {
    const schedule = baseSchedule({ startDate: "2026-09-02", endDate: "2026-09-03", timesOfDay: ["08:00:00"] });
    const instants = computeScheduleInstants(schedule, {
      windowStart: new Date("2026-09-01T00:00:00Z"),
      windowEnd: new Date("2026-09-05T23:59:59Z"),
    });
    expect(instants.map((d) => d.toISOString())).toEqual(["2026-09-02T05:00:00.000Z", "2026-09-03T05:00:00.000Z"]);
  });

  it("expands an every_n_hours (elapsed) schedule via pure UTC arithmetic from the anchor", () => {
    const schedule = baseSchedule({
      scheduleKind: "every_n_hours",
      timeAnchor: "elapsed",
      timesOfDay: null,
      intervalHours: 8,
      anchorAt: "2026-09-01T06:00:00.000Z",
    });
    const instants = computeScheduleInstants(schedule, {
      windowStart: new Date("2026-09-01T00:00:00Z"),
      windowEnd: new Date("2026-09-02T00:00:00Z"),
    });
    expect(instants.map((d) => d.toISOString())).toEqual(["2026-09-01T06:00:00.000Z", "2026-09-01T14:00:00.000Z", "2026-09-01T22:00:00.000Z"]);
  });

  it("does NOT shift an every_n_hours schedule's instants across a DST transition", () => {
    // Anchor before the 2026-03-29 Europe/Athens spring-forward, interval
    // spanning across it -- the UTC gap between instants must stay
    // exactly `intervalHours` regardless of the local clock jump.
    const schedule = baseSchedule({
      scheduleKind: "every_n_hours",
      timeAnchor: "elapsed",
      timesOfDay: null,
      intervalHours: 6,
      anchorAt: "2026-03-28T12:00:00.000Z",
      startDate: "2026-01-01",
    });
    const instants = computeScheduleInstants(schedule, {
      windowStart: new Date("2026-03-28T00:00:00Z"),
      windowEnd: new Date("2026-03-29T18:00:00Z"),
    });
    const gapsHours = instants.slice(1).map((d, i) => (d.getTime() - instants[i].getTime()) / 3_600_000);
    expect(gapsHours.every((gap) => gap === 6)).toBe(true);
  });

  it("returns instants in ascending order", () => {
    const schedule = baseSchedule({ scheduleKind: "multiple_times_daily", timesOfDay: ["20:00:00", "08:00:00"] });
    const instants = computeScheduleInstants(schedule, {
      windowStart: new Date("2026-09-01T00:00:00Z"),
      windowEnd: new Date("2026-09-01T23:59:59Z"),
    });
    expect(instants[0].getTime()).toBeLessThan(instants[1].getTime());
  });
});
