import { describe, expect, it } from "vitest";
import type { DoseEventRecord, DoseEventStatus } from "@/lib/domain/dose-event";
import type { InventoryTransactionRecord } from "@/lib/domain/inventory-transaction";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import { buildDoctorReport, parseLocalDate, reportRange, type DoctorReportInput } from "@/lib/reports/doctor-report";

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
    expect(report.medicines[0]).toMatchObject({ strength: "500 mg", form: "Δισκίο" });
  });

  it("carries who it's for and when it was made", () => {
    const report = buildDoctorReport(input());
    expect(report.personName).toBe("Μαρία Παπαδοπούλου");
    expect(report.createdAt).toEqual(NOW);
    expect(report.range).toEqual(RANGE);
    expect(report.doses).toEqual([]);
  });
});
