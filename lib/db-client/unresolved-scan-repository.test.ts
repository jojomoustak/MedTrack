import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieUnresolvedScanRepository } from "@/lib/db-client/unresolved-scan-repository";

describe("DexieUnresolvedScanRepository (Phase 1 §7 offline scan fallback)", () => {
  let db: MedTrackingDexie;
  let repo: DexieUnresolvedScanRepository;

  beforeEach(() => {
    db = new MedTrackingDexie(`test-unresolved-scan-${crypto.randomUUID()}`);
    repo = new DexieUnresolvedScanRepository(db);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("listPending() returns nothing for a profile with no saved scans", async () => {
    expect(await repo.listPending("profile-1")).toEqual([]);
  });

  it("save() persists the scan with a scannedAt timestamp and resolvedAt null", async () => {
    await repo.save({
      id: "scan-1",
      profileId: "profile-1",
      gtin: "05012345678900",
      rawValue: "0105012345678900",
      format: "GS1_DATA_MATRIX",
      parsedExpiry: "2026-12-31",
      parsedBatch: "LOT42",
      parsedSerial: null,
    });

    const pending = await repo.listPending("profile-1");
    expect(pending).toHaveLength(1);
    expect(pending[0].gtin).toBe("05012345678900");
    expect(pending[0].resolvedAt).toBeNull();
    expect(typeof pending[0].scannedAt).toBe("string");
  });

  it("listPending() only returns scans for the requested profile", async () => {
    await repo.save({
      id: "scan-a",
      profileId: "profile-a",
      gtin: "05012345678900",
      rawValue: "raw-a",
      format: "EAN_13",
      parsedExpiry: null,
      parsedBatch: null,
      parsedSerial: null,
    });
    await repo.save({
      id: "scan-b",
      profileId: "profile-b",
      gtin: "05012345678917",
      rawValue: "raw-b",
      format: "EAN_13",
      parsedExpiry: null,
      parsedBatch: null,
      parsedSerial: null,
    });

    expect(await repo.listPending("profile-a")).toHaveLength(1);
    expect(await repo.listPending("profile-b")).toHaveLength(1);
  });

  it("a scan marked resolved (resolvedAt set) is excluded from listPending()", async () => {
    await repo.save({
      id: "scan-1",
      profileId: "profile-1",
      gtin: "05012345678900",
      rawValue: "raw",
      format: "EAN_13",
      parsedExpiry: null,
      parsedBatch: null,
      parsedSerial: null,
    });
    await db.unresolvedScan.update("scan-1", { resolvedAt: new Date().toISOString() });

    expect(await repo.listPending("profile-1")).toEqual([]);
  });
});
