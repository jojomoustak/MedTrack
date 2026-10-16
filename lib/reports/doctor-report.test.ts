import { describe, expect, it } from "vitest";
import type { DoseEventRecord, DoseEventStatus } from "@/lib/domain/dose-event";
import type { InventoryTransactionRecord } from "@/lib/domain/inventory-transaction";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import { buildDoctorReport, parseLocalDate, reportRange, takenShare, type DoctorReportInput } from "@/lib/reports/doctor-report";

function medication(id: string, overrides: Partial<UserMedicationRecord> = {}): UserMedicationRecord {
  return {
    id,
    profileId: "profile-1",
    catalogProductId: null,
    customName: id,
    customForm: "tablet",
    customStrengthValue: null,
    customStrengthUnit: null,
    treatmentState: "active",
    inventoryUnit: "tablet",
    lowStockThresholdValue: null,
    expiryWarningDays: 30,
    notes: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    version: 1,
    deletedAt: null,
    clientMutationId: `cm-${id}`,
    syncState: "synced",
    ...overrides,
  };
}

let doseSeq = 0;
function dose(userMedicationId: string, scheduledAt: string | null, status: DoseEventStatus, takenAt: string | null = null): DoseEventRecord {
  doseSeq += 1;
  return {
    id: `dose-${doseSeq}`,
    profileId: "profile-1",
    userMedicationId,
    scheduleId: scheduledAt ? "schedule-1" : null,
    scheduledAt,
    reminderAt: null,
    takenAt,
    status,
    quantityValue: "1",
    quantityUnit: "tablet",
    source: scheduledAt ? "schedule_generated" : "manual_prn",
    snoozeCount: 0,
    notes: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    clientMutationId: `cm-dose-${doseSeq}`,
    syncState: "synced",
  };
}

function stock(userMedicationId: string, quantityDelta: string): InventoryTransactionRecord {
  return {
    id: `txn-${userMedicationId}-${quantityDelta}`,
    profileId: "profile-1",
    userMedicationId,
    packageId: null,
    transactionType: quantityDelta.startsWith("-") ? "dose_taken" : "refill",
    quantityDelta,
    quantityUnit: "tablet",
    doseEventId: null,
    occurredAt: "2026-09-01T08:00:00.000Z",
    recordedAt: "2026-09-01T08:00:00.000Z",
    source: "user",
    note: null,
    clientMutationId: `cm-txn-${userMedicationId}-${quantityDelta}`,
    syncState: "synced",
  };
}

function schedule(userMedicationId: string, overrides: Partial<MedicationScheduleRecord> = {}): MedicationScheduleRecord {
  return {
    id: `schedule-${userMedicationId}`,
    profileId: "profile-1",
    userMedicationId,
    scheduleKind: "multiple_times_daily",
    timeAnchor: "wall_clock",
    startDate: "2026-09-01",
    endDate: null,
    timezone: "Europe/Athens",
    doseQuantityValue: "1",
    doseQuantityUnit: "tablet",
    timesOfDay: ["20:00:00", "08:00:00"],
    weekdaysMask: null,
    intervalHours: null,
    anchorAt: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    version: 1,
    deletedAt: null,
    clientMutationId: `cm-schedule-${userMedicationId}`,
    syncState: "synced",
    ...overrides,
  };
}

const NOW = new Date(2026, 9, 16, 12, 0); // 16 Oct 2026, 12:00 local
const RANGE = { from: new Date(2026, 9, 1), to: new Date(2026, 9, 16, 23, 59, 59, 999) };

function input(overrides: Partial<DoctorReportInput> = {}): DoctorReportInput {
  const medications = overrides.medications ?? [medication("Algofren"), medication("Flagyl")];
  return {
    personName: "Μαρία Παπαδοπούλου",
    range: RANGE,
    now: NOW,
    medications,
    names: new Map(medications.map((m) => [m.id, m.customName ?? m.id])),
    fullNames: new Map(medications.map((m) => [m.id, `${m.customName ?? m.id} (full)`])),
    strengths: new Map(medications.map((m) => [m.id, "500 mg"])),
    schedules: [],
    doseEvents: [],
    transactions: [],
    ...overrides,
  };
}

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

describe("reportRange", () => {
  it("the last 30 days end today and start 29 days before", () => {
    const result = reportRange("30d", NOW);
    expect(result.ok && result.range.from).toEqual(new Date(2026, 8, 17));
    expect(result.ok && result.range.to).toEqual(new Date(2026, 9, 16, 23, 59, 59, 999));
  });

  it("3 and 6 months start the day after the same date that many months back", () => {
    const three = reportRange("3m", NOW);
    expect(three.ok && three.range.from).toEqual(new Date(2026, 6, 17));
    const six = reportRange("6m", NOW);
    expect(six.ok && six.range.from).toEqual(new Date(2026, 3, 17));
  });

  it("stays inside a shorter month (31 May, 3 months back, is the end of February)", () => {
    const result = reportRange("3m", new Date(2026, 4, 31, 9));
    expect(result.ok && result.range.from).toEqual(new Date(2026, 2, 1));
  });

  it("a chosen period covers both days whole", () => {
    const result = reportRange("custom", NOW, { from: "2026-10-01", to: "2026-10-05" });
    expect(result).toEqual({ ok: true, range: { from: new Date(2026, 9, 1), to: new Date(2026, 9, 5, 23, 59, 59, 999) } });
  });

  it("explains a chosen period it can't use", () => {
    expect(reportRange("custom", NOW, { from: "", to: "2026-10-05" })).toEqual({ ok: false, error: "Επιλέξτε και τις δύο ημερομηνίες." });
    expect(reportRange("custom", NOW, { from: "2026-10-06", to: "2026-10-05" }).ok).toBe(false);
    expect(reportRange("custom", NOW, { from: "2026-10-01", to: "2026-10-17" }).ok).toBe(false);
    expect(reportRange("custom", NOW, { from: "2025-10-01", to: "2026-10-16" })).toEqual({ ok: false, error: "Επιλέξτε διάστημα έως 12 μηνών." });
    expect(reportRange("custom", NOW, { from: "2025-10-16", to: "2026-10-16" }).ok).toBe(true);
  });

  it("parses only real dates", () => {
    expect(parseLocalDate("2026-02-30")).toBeNull();
    expect(parseLocalDate("16/10/2026")).toBeNull();
    expect(parseLocalDate("2026-10-16")).toEqual(new Date(2026, 9, 16));
  });
});

describe("buildDoctorReport", () => {
  it("lists every dose of the period in order, with what was recorded", () => {
    const report = buildDoctorReport(
      input({
        doseEvents: [
          dose("Flagyl", at(3, 20), "missed"),
          dose("Algofren", at(3, 8), "taken", at(3, 8, 10)),
          dose("Flagyl", at(3, 8), "taken_late", at(3, 11, 30)),
          dose("Algofren", at(4, 8), "skipped"),
          dose("Algofren", at(5, 8), "reminded"),
        ],
      }),
    );
    expect(report.doses.map((d) => [d.day, d.medicine, d.status, d.takenAt?.toISOString() ?? null])).toEqual([
      ["2026-10-03", "Algofren", "taken", at(3, 8, 10)],
      ["2026-10-03", "Flagyl", "taken_late", at(3, 11, 30)],
      ["2026-10-03", "Flagyl", "missed", null],
      ["2026-10-04", "Algofren", "skipped", null],
      // Its time passed with nothing recorded.
      ["2026-10-05", "Algofren", "unrecorded", null],
    ]);
    expect(report.doses[0].quantity).toBe("1 δισκίο");
  });

  it("leaves out doses outside the period, still to come, called off, or of a deleted medicine", () => {
    const report = buildDoctorReport(
      input({
        medications: [medication("Algofren"), medication("Deleted", { deletedAt: "2026-10-10T00:00:00.000Z" })].filter((m) => m.deletedAt === null),
        doseEvents: [
          dose("Algofren", new Date(2026, 8, 30, 8).toISOString(), "taken", new Date(2026, 8, 30, 8).toISOString()),
          dose("Algofren", at(16, 20), "scheduled"),
          dose("Algofren", at(10, 8), "cancelled"),
          dose("Deleted", at(10, 8), "taken", at(10, 8)),
          dose("Algofren", at(16, 8), "taken", at(16, 8)),
        ],
      }),
    );
    expect(report.doses.map((d) => [d.day, d.medicine])).toEqual([["2026-10-16", "Algofren"]]);
  });

  it("keeps a dose scheduled later today that was already taken, and places one with no scheduled time by when it was taken", () => {
    const report = buildDoctorReport(
      input({
        doseEvents: [dose("Algofren", at(16, 20), "taken", at(16, 11)), dose("Flagyl", null, "taken", at(12, 15))],
      }),
    );
    expect(report.doses.map((d) => [d.day, d.medicine, d.scheduled])).toEqual([
      ["2026-10-12", "Flagyl", false],
      ["2026-10-16", "Algofren", true],
    ]);
  });

  it("lists medicines taken or paused, and finished ones only with doses in the period, with today's stock", () => {
    const report = buildDoctorReport(
      input({
        medications: [
          medication("Zinadol"),
          medication("Algofren"),
          medication("Paused", { treatmentState: "paused" }),
          medication("Finished", { treatmentState: "completed" }),
          medication("Stopped", { treatmentState: "discontinued" }),
        ],
        doseEvents: [dose("Stopped", at(2, 8), "taken", at(2, 8))],
        transactions: [stock("Algofren", "30"), stock("Algofren", "-6"), stock("Zinadol", "2"), stock("Zinadol", "-3")],
      }),
    );
    expect(report.medicines.map((m) => [m.name, m.treatment, m.stock])).toEqual([
      ["Algofren (full)", "Ενεργό", "24 δισκία"],
      ["Paused (full)", "Σε παύση", null],
      ["Stopped (full)", "Διακοπή", null],
      // More taken than was ever entered: none left, never a negative count.
      ["Zinadol (full)", "Ενεργό", "0 δισκία"],
    ]);
    expect(report.medicines[0]).toMatchObject({ details: "500 mg · Δισκίο", schedule: [], stockDays: null });
  });

  it("gives each medicine its running schedules, and how long its stock lasts at that rate", () => {
    const report = buildDoctorReport(
      input({
        medications: [medication("Algofren"), medication("Paused", { treatmentState: "paused" })],
        schedules: [
          schedule("Algofren"),
          // Ended, or deleted: not running.
          { ...schedule("Algofren"), id: "ended", endDate: "2026-10-01" },
          { ...schedule("Algofren"), id: "deleted", deletedAt: "2026-10-02T00:00:00.000Z" },
          schedule("Paused", { scheduleKind: "prn", timeAnchor: null, timesOfDay: null, doseQuantityValue: "2" }),
        ],
        transactions: [stock("Algofren", "30"), stock("Paused", "10")],
      }),
    );
    expect(report.medicines.map((m) => [m.name, m.schedule, m.stock, m.stockDays])).toEqual([
      // 30 tablets at 2 a day.
      ["Algofren (full)", ["2 φορές την ημέρα · 08:00, 20:00 · 1 δισκίο"], "30 δισκία", 15],
      // Not being taken now: no estimate.
      ["Paused (full)", ["Όταν χρειάζεται · 2 δισκία"], "10 δισκία", null],
    ]);
  });

  it("sums up how every dose ended: overall, per medicine, by time of day and by week", () => {
    const report = buildDoctorReport(
      input({
        doseEvents: [
          dose("Algofren", at(3, 8), "taken", at(3, 8, 5)),
          dose("Flagyl", at(3, 8), "taken_late", at(3, 11)),
          dose("Flagyl", at(3, 20), "missed"),
          dose("Algofren", at(4, 8), "skipped"),
          dose("Algofren", at(5, 8), "reminded"),
          dose("Algofren", at(6, 8), "taken", at(6, 8)),
          dose("Algofren", at(6, 21), "taken", at(6, 21)),
        ],
      }),
    );
    const { summary } = report;
    expect(summary.overall).toEqual({ total: 7, taken: 3, takenLate: 1, skipped: 1, missed: 1, unrecorded: 1 });
    expect(takenShare(summary.overall)).toBeCloseTo(4 / 7);
    // Days 3–6 had doses; only on the 6th were they all taken.
    expect([summary.daysWithDoses, summary.daysAllTaken]).toEqual([4, 1]);
    expect(summary.byMedicine).toEqual([
      { label: "Algofren", counts: { total: 5, taken: 3, takenLate: 0, skipped: 1, missed: 0, unrecorded: 1 } },
      { label: "Flagyl", counts: { total: 2, taken: 0, takenLate: 1, skipped: 0, missed: 1, unrecorded: 0 } },
    ]);
    expect(summary.byTimeOfDay.map((row) => [row.label, row.counts.total])).toEqual([
      ["Πρωί (05:00–11:59)", 5],
      ["Απόγευμα (17:00–20:59)", 1],
      ["Βράδυ (21:00–23:59)", 1],
    ]);
    // 1–16 October, Monday to Sunday, cut to the period.
    expect(summary.byPeriodUnit).toBe("week");
    expect(summary.byPeriod.map((row) => [row.label, row.counts.total])).toEqual([
      ["01/10 – 04/10", 4],
      ["05/10 – 11/10", 3],
      ["12/10 – 16/10", 0],
    ]);
  });

  it("goes month by month for a longer period", () => {
    const range = reportRange("6m", NOW);
    if (!range.ok) throw new Error("range");
    const report = buildDoctorReport(input({ range: range.range }));
    expect(report.summary.byPeriodUnit).toBe("month");
    expect(report.summary.byPeriod.map((row) => row.label)).toEqual([
      "Απρίλιος 2026",
      "Μάιος 2026",
      "Ιούνιος 2026",
      "Ιούλιος 2026",
      "Αύγουστος 2026",
      "Σεπτέμβριος 2026",
      "Οκτώβριος 2026",
    ]);
  });

  it("counts a dose with no scheduled time, but not under a time of day", () => {
    const report = buildDoctorReport(input({ doseEvents: [dose("Flagyl", null, "taken", at(12, 15))] }));
    expect(report.summary.overall.total).toBe(1);
    expect(report.summary.byTimeOfDay).toEqual([]);
  });

  it("has nothing to share out of no doses", () => {
    const report = buildDoctorReport(input());
    expect(takenShare(report.summary.overall)).toBeNull();
    expect([report.summary.daysWithDoses, report.summary.daysAllTaken]).toEqual([0, 0]);
  });

  it("carries who it's for and when it was made", () => {
    const report = buildDoctorReport(input());
    expect(report.personName).toBe("Μαρία Παπαδοπούλου");
    expect(report.createdAt).toEqual(NOW);
    expect(report.range).toEqual(RANGE);
    expect(report.doses).toEqual([]);
  });
});
