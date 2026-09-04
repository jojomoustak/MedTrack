import { describe, expect, it } from "vitest";
import {
  buildDoseReversedConsumption,
  buildDoseTakenConsumption,
  computeCurrentStock,
  computePackageRemainingStock,
  computeRefillProjection,
  isBelowLowStockThreshold,
  isRunningLowSoon,
  scheduledOccurrencesPerDay,
  selectFifoPackageId,
} from "@/lib/domain/inventory-consumption";
import type { InventoryTransactionRecord } from "@/lib/domain/inventory-transaction";
import type { MedicationPackageRecord } from "@/lib/domain/medication-package";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";

const MED = "med-1";
const PROFILE = "profile-1";

function pkg(overrides: Partial<MedicationPackageRecord> = {}): MedicationPackageRecord {
  return {
    id: "pkg-1",
    profileId: PROFILE,
    userMedicationId: MED,
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

function txn(overrides: Partial<InventoryTransactionRecord> = {}): InventoryTransactionRecord {
  return {
    id: "txn-" + Math.random().toString(36).slice(2),
    profileId: PROFILE,
    userMedicationId: MED,
    packageId: null,
    transactionType: "package_opened",
    quantityDelta: "30",
    quantityUnit: "tablet",
    doseEventId: null,
    occurredAt: "2026-01-01T00:00:00.000Z",
    recordedAt: "2026-01-01T00:00:00.000Z",
    source: "user",
    note: null,
    clientMutationId: "cmid-" + Math.random().toString(36).slice(2),
    syncState: "synced",
    ...overrides,
  };
}

function schedule(overrides: Partial<MedicationScheduleRecord> = {}): MedicationScheduleRecord {
  return {
    id: "schedule-1",
    profileId: PROFILE,
    userMedicationId: MED,
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
    clientMutationId: "cmid-sched",
    syncState: "synced",
    ...overrides,
  };
}

describe("computeCurrentStock", () => {
  it("sums quantityDelta for the given medication only", () => {
    const transactions = [
      txn({ quantityDelta: "30" }),
      txn({ quantityDelta: "-1" }),
      txn({ quantityDelta: "-1" }),
      txn({ userMedicationId: "other-med", quantityDelta: "100" }),
    ];
    expect(computeCurrentStock(transactions, MED)).toBe("28");
  });

  it("returns 0 for no transactions", () => {
    expect(computeCurrentStock([], MED)).toBe("0");
  });

  it("preserves 3-decimal precision without float drift", () => {
    const transactions = [txn({ quantityDelta: "0.1" }), txn({ quantityDelta: "0.2" })];
    expect(computeCurrentStock(transactions, MED)).toBe("0.3");
  });
});

describe("computePackageRemainingStock", () => {
  it("sums quantityDelta for the given package only", () => {
    const transactions = [txn({ packageId: "pkg-1", quantityDelta: "30" }), txn({ packageId: "pkg-1", quantityDelta: "-2" }), txn({ packageId: "pkg-2", quantityDelta: "10" })];
    expect(computePackageRemainingStock(transactions, "pkg-1")).toBe("28");
  });

  it("never displays negative — clamps to 0", () => {
    const transactions = [txn({ packageId: "pkg-1", quantityDelta: "1" }), txn({ packageId: "pkg-1", quantityDelta: "-3" })];
    expect(computePackageRemainingStock(transactions, "pkg-1")).toBe("0");
  });
});

describe("selectFifoPackageId", () => {
  it("returns null when there are no open packages", () => {
    const packages = [pkg({ status: "unopened" })];
    expect(selectFifoPackageId(packages, [], MED)).toBeNull();
  });

  it("picks the package with the soonest expiry among open packages with remaining stock", () => {
    const packages = [
      pkg({ id: "pkg-later", expiryDate: "2026-06-01" }),
      pkg({ id: "pkg-soonest", expiryDate: "2026-03-01" }),
    ];
    const transactions = [
      txn({ packageId: "pkg-later", quantityDelta: "30" }),
      txn({ packageId: "pkg-soonest", quantityDelta: "30" }),
    ];
    expect(selectFifoPackageId(packages, transactions, MED)).toBe("pkg-soonest");
  });

  it("ranks a known expiry ahead of an unknown one (NULLS LAST)", () => {
    const packages = [pkg({ id: "pkg-unknown-expiry", expiryDate: null }), pkg({ id: "pkg-known-expiry", expiryDate: "2099-01-01" })];
    const transactions = [
      txn({ packageId: "pkg-unknown-expiry", quantityDelta: "30" }),
      txn({ packageId: "pkg-known-expiry", quantityDelta: "30" }),
    ];
    expect(selectFifoPackageId(packages, transactions, MED)).toBe("pkg-known-expiry");
  });

  it("breaks a same-expiry tie by whichever was opened first", () => {
    const packages = [
      pkg({ id: "pkg-opened-later", expiryDate: "2026-06-01", openedAt: "2026-01-05T00:00:00.000Z" }),
      pkg({ id: "pkg-opened-first", expiryDate: "2026-06-01", openedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const transactions = [
      txn({ packageId: "pkg-opened-later", quantityDelta: "30" }),
      txn({ packageId: "pkg-opened-first", quantityDelta: "30" }),
    ];
    expect(selectFifoPackageId(packages, transactions, MED)).toBe("pkg-opened-first");
  });

  it("excludes a package whose computed remaining stock has already hit zero", () => {
    const packages = [pkg({ id: "pkg-empty" }), pkg({ id: "pkg-has-stock", expiryDate: "2099-01-01" })];
    const transactions = [
      txn({ packageId: "pkg-empty", quantityDelta: "1" }),
      txn({ packageId: "pkg-empty", quantityDelta: "-1" }),
      txn({ packageId: "pkg-has-stock", quantityDelta: "30" }),
    ];
    expect(selectFifoPackageId(packages, transactions, MED)).toBe("pkg-has-stock");
  });

  it("excludes packages for a different medication", () => {
    const packages = [pkg({ id: "other-med-pkg", userMedicationId: "other-med" })];
    const transactions = [txn({ packageId: "other-med-pkg", userMedicationId: "other-med", quantityDelta: "30" })];
    expect(selectFifoPackageId(packages, transactions, MED)).toBeNull();
  });

  it("excludes a soft-deleted package", () => {
    const packages = [pkg({ id: "deleted-pkg", deletedAt: "2026-01-02T00:00:00.000Z" })];
    const transactions = [txn({ packageId: "deleted-pkg", quantityDelta: "30" })];
    expect(selectFifoPackageId(packages, transactions, MED)).toBeNull();
  });
});

describe("buildDoseTakenConsumption", () => {
  const baseParams = {
    id: "new-txn",
    clientMutationId: "cmid-new",
    profileId: PROFILE,
    userMedicationId: MED,
    doseEventId: "dose-1",
    quantityValue: "1",
    quantityUnit: "tablet",
    occurredAt: "2026-01-10T08:00:00.000Z",
    source: "user" as const,
  };

  it("records a negative delta and null packageId when no package is open", () => {
    const result = buildDoseTakenConsumption({ ...baseParams, packages: [], transactions: [] });
    expect(result.transaction.quantityDelta).toBe("-1");
    expect(result.transaction.packageId).toBeNull();
    expect(result.transaction.transactionType).toBe("dose_taken");
    expect(result.transaction.doseEventId).toBe("dose-1");
    expect(result.depletedPackageId).toBeNull();
  });

  it("attributes the full dose to the FIFO-selected package, never splitting", () => {
    const packages = [pkg({ id: "pkg-1" })];
    const transactions = [txn({ packageId: "pkg-1", quantityDelta: "30" })];
    const result = buildDoseTakenConsumption({ ...baseParams, quantityValue: "2", packages, transactions });
    expect(result.transaction.packageId).toBe("pkg-1");
    expect(result.transaction.quantityDelta).toBe("-2");
  });

  it("flags the package as depleted when this dose drives its remaining stock to exactly zero", () => {
    const packages = [pkg({ id: "pkg-1" })];
    const transactions = [txn({ packageId: "pkg-1", quantityDelta: "1" })];
    const result = buildDoseTakenConsumption({ ...baseParams, quantityValue: "1", packages, transactions });
    expect(result.depletedPackageId).toBe("pkg-1");
  });

  it("flags the package as depleted when this dose drives its remaining stock negative", () => {
    const packages = [pkg({ id: "pkg-1" })];
    const transactions = [txn({ packageId: "pkg-1", quantityDelta: "0.5" })];
    const result = buildDoseTakenConsumption({ ...baseParams, quantityValue: "1", packages, transactions });
    expect(result.depletedPackageId).toBe("pkg-1");
  });

  it("does not flag the package as depleted while stock remains", () => {
    const packages = [pkg({ id: "pkg-1" })];
    const transactions = [txn({ packageId: "pkg-1", quantityDelta: "30" })];
    const result = buildDoseTakenConsumption({ ...baseParams, quantityValue: "1", packages, transactions });
    expect(result.depletedPackageId).toBeNull();
  });
});

describe("buildDoseReversedConsumption", () => {
  it("returns null when there is no dose_taken row to reverse", () => {
    expect(
      buildDoseReversedConsumption({
        id: "rev-1",
        clientMutationId: "cmid-rev",
        profileId: PROFILE,
        userMedicationId: MED,
        doseEventId: "dose-1",
        occurredAt: "2026-01-10T09:00:00.000Z",
        source: "user",
        transactions: [],
      }),
    ).toBeNull();
  });

  it("copies packageId verbatim from the original dose_taken row and inverts the delta", () => {
    const original = txn({ transactionType: "dose_taken", doseEventId: "dose-1", packageId: "pkg-original", quantityDelta: "-1" });
    const result = buildDoseReversedConsumption({
      id: "rev-1",
      clientMutationId: "cmid-rev",
      profileId: PROFILE,
      userMedicationId: MED,
      doseEventId: "dose-1",
      occurredAt: "2026-01-10T09:00:00.000Z",
      source: "user",
      transactions: [original],
    });
    expect(result?.packageId).toBe("pkg-original");
    expect(result?.quantityDelta).toBe("1");
    expect(result?.transactionType).toBe("dose_reversed");
  });
});

describe("scheduledOccurrencesPerDay", () => {
  it("is 0 for a PRN schedule", () => {
    expect(scheduledOccurrencesPerDay(schedule({ scheduleKind: "prn", timesOfDay: null }))).toBe(0);
  });

  it("is the count of timesOfDay for a daily schedule", () => {
    expect(scheduledOccurrencesPerDay(schedule({ timesOfDay: ["08:00:00", "20:00:00"] }))).toBe(2);
  });

  it("is 24/intervalHours for an every_n_hours schedule", () => {
    expect(
      scheduledOccurrencesPerDay(
        schedule({ scheduleKind: "every_n_hours", timeAnchor: "elapsed", timesOfDay: null, intervalHours: 8, anchorAt: "2026-01-01T00:00:00.000Z" }),
      ),
    ).toBe(3);
  });

  it("averages down for specific_weekdays (doesn't apply every day)", () => {
    // Monday + Thursday only, once/day -> 2 occurrences per 7 days
    const mask = (1 << 1) | (1 << 4);
    const result = scheduledOccurrencesPerDay(schedule({ scheduleKind: "specific_weekdays", weekdaysMask: mask, timesOfDay: ["08:00:00"] }));
    expect(result).toBeCloseTo(2 / 7, 5);
  });
});

describe("computeRefillProjection", () => {
  it("returns basis 'none' with no transactions and no schedule", () => {
    const result = computeRefillProjection(MED, [], [], new Date("2026-01-15T00:00:00.000Z"));
    expect(result.basis).toBe("none");
    expect(result.daysRemaining).toBeNull();
  });

  it("uses the scheduled rate when there isn't enough observed history", () => {
    const transactions = [txn({ quantityDelta: "30" })];
    const schedules = [schedule({ timesOfDay: ["08:00:00"] })]; // 1/day
    const result = computeRefillProjection(MED, transactions, schedules, new Date("2026-01-15T00:00:00.000Z"));
    expect(result.basis).toBe("scheduled");
    expect(result.daysRemaining).toBe(30);
  });

  it("prefers the observed rate once there are at least 5 doses in the trailing 14 days", () => {
    const now = new Date("2026-01-15T00:00:00.000Z");
    const transactions = [
      txn({ quantityDelta: "30", occurredAt: "2026-01-01T00:00:00.000Z" }),
      ...Array.from({ length: 5 }, (_, i) =>
        txn({ transactionType: "dose_taken", doseEventId: `dose-${i}`, quantityDelta: "-2", occurredAt: `2026-01-1${i}T08:00:00.000Z` }),
      ),
    ];
    // Observed: 10 units over 14 days = 0.714/day -> should win over any schedule.
    const schedules = [schedule({ timesOfDay: ["08:00:00"] })]; // would imply 1/day if used
    const result = computeRefillProjection(MED, transactions, schedules, now);
    expect(result.basis).toBe("observed");
  });

  it("ignores dose_taken transactions outside the trailing 14-day window", () => {
    const now = new Date("2026-02-01T00:00:00.000Z");
    const transactions = [
      txn({ quantityDelta: "100", occurredAt: "2026-01-01T00:00:00.000Z" }),
      ...Array.from({ length: 5 }, (_, i) =>
        txn({ transactionType: "dose_taken", doseEventId: `old-${i}`, quantityDelta: "-1", occurredAt: "2026-01-02T08:00:00.000Z" }),
      ),
    ];
    const result = computeRefillProjection(MED, transactions, [], now);
    // Those 5 doses are outside the 14-day trailing window from 2026-02-01, so basis falls back to none (no schedule either).
    expect(result.basis).toBe("none");
  });

  it("floors daysRemaining rather than rounding (conservative)", () => {
    const transactions = [txn({ quantityDelta: "10" })];
    const schedules = [schedule({ timesOfDay: ["08:00:00", "20:00:00", "23:00:00"] })]; // 3/day -> 3.33 days, should floor to 3
    const result = computeRefillProjection(MED, transactions, schedules, new Date("2026-01-15T00:00:00.000Z"));
    expect(result.daysRemaining).toBe(3);
  });
});

describe("isBelowLowStockThreshold / isRunningLowSoon", () => {
  it("is false when no threshold is set", () => {
    expect(isBelowLowStockThreshold("5", null)).toBe(false);
  });

  it("is true when current stock is below the threshold", () => {
    expect(isBelowLowStockThreshold("5", "10")).toBe(true);
  });

  it("is false when current stock is at or above the threshold", () => {
    expect(isBelowLowStockThreshold("10", "10")).toBe(false);
  });

  it("isRunningLowSoon fires within the horizon even when the raw threshold hasn't been crossed", () => {
    const projection = { currentStock: "20", basis: "scheduled" as const, dailyRate: 5, daysRemaining: 4, projectedOutOfStockDate: "2026-01-19" };
    expect(isRunningLowSoon(projection)).toBe(true);
  });

  it("isRunningLowSoon is false with no projection available", () => {
    expect(isRunningLowSoon({ currentStock: "0", basis: "none", dailyRate: null, daysRemaining: null, projectedOutOfStockDate: null })).toBe(false);
  });
});
