import { describe, expect, it, vi } from "vitest";
import { consumeInventoryForDoseTaken } from "@/lib/inventory/client/consume-dose";
import { deriveDoseTakenTransactionId } from "@/lib/domain/inventory-consumption";
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import type { MedicationPackageRecord } from "@/lib/domain/medication-package";

function dose(overrides: Partial<DoseEventRecord> = {}): DoseEventRecord {
  return {
    id: "dose-1",
    profileId: "profile-1",
    userMedicationId: "med-1",
    scheduleId: "schedule-1",
    scheduledAt: "2026-01-10T08:00:00.000Z",
    reminderAt: "2026-01-10T08:00:00.000Z",
    takenAt: "2026-01-10T08:03:00.000Z",
    status: "taken",
    quantityValue: "1",
    quantityUnit: "tablet",
    source: "schedule_generated",
    snoozeCount: 0,
    createdAt: "2026-01-10T00:00:00.000Z",
    updatedAt: "2026-01-10T08:03:00.000Z",
    clientMutationId: "cmid-dose",
    syncState: "synced",
    ...overrides,
  };
}

function pkg(overrides: Partial<MedicationPackageRecord> = {}): MedicationPackageRecord {
  return {
    id: "pkg-1",
    profileId: "profile-1",
    userMedicationId: "med-1",
    source: "manual",
    gtin: null,
    batchNumber: null,
    serialNumber: null,
    expiryDate: null,
    receivedDate: "2026-01-01",
    initialQuantityValue: "30",
    quantityUnit: "tablet",
    status: "opened",
    openedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    deletedAt: null,
    clientMutationId: "cmid-pkg",
    syncState: "synced",
    ...overrides,
  };
}

describe("consumeInventoryForDoseTaken", () => {
  it("is a no-op when the dose carries no quantity", async () => {
    const medicationPackages = { listByUserMedication: vi.fn(), update: vi.fn() };
    const inventoryTransactions = { listByUserMedication: vi.fn(), createIfMissing: vi.fn() };
    await consumeInventoryForDoseTaken(dose({ quantityValue: null }), { medicationPackages, inventoryTransactions } as never);
    expect(medicationPackages.listByUserMedication).not.toHaveBeenCalled();
  });

  it("records a dose_taken ledger transaction with a deterministic id", async () => {
    const medicationPackages = { listByUserMedication: vi.fn().mockResolvedValue([]), update: vi.fn() };
    const inventoryTransactions = { listByUserMedication: vi.fn().mockResolvedValue([]), createIfMissing: vi.fn().mockResolvedValue(undefined) };
    const d = dose();

    await consumeInventoryForDoseTaken(d, { medicationPackages, inventoryTransactions } as never);

    expect(inventoryTransactions.createIfMissing).toHaveBeenCalledTimes(1);
    const [txn] = inventoryTransactions.createIfMissing.mock.calls[0];
    expect(txn.doseEventId).toBe("dose-1");
    expect(txn.quantityDelta).toBe("-1");
    expect(txn.transactionType).toBe("dose_taken");
    expect(txn.id).toBe(await deriveDoseTakenTransactionId("dose-1"));
  });

  it("marks the FIFO-selected package depleted when this dose exhausts it", async () => {
    const packages = [pkg()];
    const medicationPackages = { listByUserMedication: vi.fn().mockResolvedValue(packages), update: vi.fn().mockResolvedValue(undefined) };
    const inventoryTransactions = {
      listByUserMedication: vi.fn().mockResolvedValue([{ packageId: "pkg-1", quantityDelta: "1", userMedicationId: "med-1" }]),
      createIfMissing: vi.fn().mockResolvedValue(undefined),
    };

    await consumeInventoryForDoseTaken(dose(), { medicationPackages, inventoryTransactions } as never);

    expect(medicationPackages.update).toHaveBeenCalledWith("pkg-1", { status: "depleted" }, expect.any(String));
  });

  it("swallows a repository failure rather than throwing (best-effort)", async () => {
    const medicationPackages = { listByUserMedication: vi.fn().mockRejectedValue(new Error("boom")), update: vi.fn() };
    const inventoryTransactions = { listByUserMedication: vi.fn(), createIfMissing: vi.fn() };
    await expect(consumeInventoryForDoseTaken(dose(), { medicationPackages, inventoryTransactions } as never)).resolves.toBeUndefined();
  });
});
