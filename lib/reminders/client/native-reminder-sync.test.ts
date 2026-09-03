import { describe, expect, it, vi } from "vitest";
import { syncNativeRemindersNow } from "@/lib/reminders/client/native-reminder-sync";
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

function makeDose(overrides: Partial<DoseEventRecord> = {}): DoseEventRecord {
  return {
    id: "dose-1",
    profileId: "profile-1",
    userMedicationId: "med-1",
    scheduleId: "schedule-1",
    scheduledAt: "2026-01-01T08:00:00.000Z",
    reminderAt: "2026-01-01T08:00:00.000Z",
    takenAt: null,
    status: "scheduled",
    quantityValue: "1",
    quantityUnit: "tablet",
    source: "schedule_generated",
    snoozeCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    clientMutationId: "cmid-1",
    syncState: "synced",
    ...overrides,
  };
}

function makeMed(overrides: Partial<UserMedicationRecord> = {}): UserMedicationRecord {
  return {
    id: "med-1",
    profileId: "profile-1",
    catalogProductId: null,
    customName: "Depon 500mg",
    customForm: "tablet",
    customStrengthValue: null,
    customStrengthUnit: null,
    treatmentState: "active",
    inventoryUnit: "tablet",
    lowStockThresholdValue: null,
    expiryWarningDays: 30,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    deletedAt: null,
    clientMutationId: "cmid-1",
    syncState: "synced",
    ...overrides,
  };
}

function makeDeps(doseEvents: DoseEventRecord[], overrides: Partial<Parameters<typeof syncNativeRemindersNow>[1]> = {}) {
  return {
    doseEvents: { listForProfileInRange: vi.fn().mockResolvedValue(doseEvents) },
    userMedications: { get: vi.fn().mockResolvedValue(makeMed()) },
    catalogCache: { get: vi.fn().mockResolvedValue(null) },
    offlineIndex: { getById: vi.fn().mockResolvedValue(null) },
    platform: {
      isAvailable: () => true,
      upsertReminder: vi.fn().mockResolvedValue({ status: "ok" }),
      cancelRemindersForDoseEvent: vi.fn().mockResolvedValue({ status: "ok" }),
    },
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("syncNativeRemindersNow", () => {
  it("is a no-op when the platform reports unavailable — never touches the repositories", async () => {
    const deps = makeDeps([makeDose()], { platform: { isAvailable: () => false, upsertReminder: vi.fn(), cancelRemindersForDoseEvent: vi.fn() } });
    await syncNativeRemindersNow("profile-1", deps);
    expect(deps.doseEvents.listForProfileInRange).not.toHaveBeenCalled();
  });

  it("upserts a reminder for a still-scheduled dose event using reminderAt as the trigger time", async () => {
    const deps = makeDeps([makeDose()]);
    await syncNativeRemindersNow("profile-1", deps);

    expect(deps.platform.upsertReminder).toHaveBeenCalledWith({
      doseEventId: "dose-1",
      scheduleId: "schedule-1",
      triggerAtEpochMs: new Date("2026-01-01T08:00:00.000Z").getTime(),
      medicationLabel: "Depon 500mg",
      doseText: "1 Δισκίο",
    });
    expect(deps.platform.cancelRemindersForDoseEvent).not.toHaveBeenCalled();
  });

  it("cancels, rather than upserts, a dose event that has already reached a terminal status", async () => {
    const deps = makeDeps([makeDose({ status: "taken", takenAt: "2026-01-01T08:00:00.000Z" })]);
    await syncNativeRemindersNow("profile-1", deps);

    expect(deps.platform.cancelRemindersForDoseEvent).toHaveBeenCalledWith("dose-1");
    expect(deps.platform.upsertReminder).not.toHaveBeenCalled();
  });

  it("still upserts a snoozed dose event (non-terminal) using its updated reminderAt", async () => {
    const deps = makeDeps([makeDose({ status: "snoozed", reminderAt: "2026-01-01T08:10:00.000Z", snoozeCount: 1 })]);
    await syncNativeRemindersNow("profile-1", deps);

    expect(deps.platform.upsertReminder).toHaveBeenCalledWith(
      expect.objectContaining({ doseEventId: "dose-1", triggerAtEpochMs: new Date("2026-01-01T08:10:00.000Z").getTime() }),
    );
  });

  it("skips a PRN-style dose event with no scheduleId or reminderAt", async () => {
    const deps = makeDeps([makeDose({ scheduleId: null, reminderAt: null })]);
    await syncNativeRemindersNow("profile-1", deps);

    expect(deps.platform.upsertReminder).not.toHaveBeenCalled();
    expect(deps.platform.cancelRemindersForDoseEvent).not.toHaveBeenCalled();
  });

  it("resolves the medication name once per medication, even across multiple dose events for it", async () => {
    const deps = makeDeps([makeDose({ id: "dose-1" }), makeDose({ id: "dose-2", reminderAt: "2026-01-02T08:00:00.000Z" })]);
    await syncNativeRemindersNow("profile-1", deps);

    expect(deps.userMedications.get).toHaveBeenCalledTimes(1);
    expect(deps.platform.upsertReminder).toHaveBeenCalledTimes(2);
  });

  it("falls back to the catalog placeholder name when a catalog-linked medication can't be resolved", async () => {
    const deps = makeDeps([makeDose()], {
      userMedications: { get: vi.fn().mockResolvedValue(makeMed({ customName: null, catalogProductId: "prod-1" })) },
    });
    await syncNativeRemindersNow("profile-1", deps);

    expect(deps.platform.upsertReminder).toHaveBeenCalledWith(expect.objectContaining({ medicationLabel: "Φάρμακο από κατάλογο" }));
  });

  it("uses a generic dose label when quantityValue/quantityUnit are missing (e.g. a PRN-shaped record)", async () => {
    const deps = makeDeps([makeDose({ quantityValue: null, quantityUnit: null })]);
    await syncNativeRemindersNow("profile-1", deps);

    expect(deps.platform.upsertReminder).toHaveBeenCalledWith(expect.objectContaining({ doseText: "Υπενθύμιση δόσης" }));
  });

  it("isolates one dose event's failure — a bad medication lookup doesn't stop the rest of the pass", async () => {
    const deps = makeDeps([makeDose({ id: "dose-1" }), makeDose({ id: "dose-2" })], {
      userMedications: { get: vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(makeMed()) },
    });
    await syncNativeRemindersNow("profile-1", deps);

    expect(deps.platform.upsertReminder).toHaveBeenCalledTimes(1);
    expect(deps.platform.upsertReminder).toHaveBeenCalledWith(expect.objectContaining({ doseEventId: "dose-2" }));
  });

  it("queries a range from 2h in the past to 36h ahead of `now`", async () => {
    const deps = makeDeps([]);
    await syncNativeRemindersNow("profile-1", deps);

    expect(deps.doseEvents.listForProfileInRange).toHaveBeenCalledWith("profile-1", "2025-12-31T22:00:00.000Z", "2026-01-02T12:00:00.000Z");
  });
});
