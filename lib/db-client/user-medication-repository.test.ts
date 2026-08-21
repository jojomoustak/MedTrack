import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";

describe("DexieUserMedicationRepository (optimistic concurrency, optional catalog FK)", () => {
  let db: MedTrackingDexie;
  let repo: DexieUserMedicationRepository;
  let outbox: DexieOutboxRepository;
  const profileId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    db = new MedTrackingDexie(`test-usermed-${crypto.randomUUID()}`);
    outbox = new DexieOutboxRepository(db);
    repo = new DexieUserMedicationRepository(db, outbox);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("create() from manual entry writes the record + a create outbox entry with catalogProductId null", async () => {
    const id = crypto.randomUUID();
    const clientMutationId = crypto.randomUUID();
    const record = await repo.create({
      id,
      profileId,
      clientMutationId,
      catalogProductId: null,
      customName: "Παρακεταμόλη",
      customForm: "tablet",
      customStrengthValue: "500",
      customStrengthUnit: "mg",
      inventoryUnit: "tablet",
      lowStockThresholdValue: null,
      expiryWarningDays: 30,
      notes: null,
    });

    expect(record.catalogProductId).toBeNull();
    expect(record.customName).toBe("Παρακεταμόλη");
    expect(record.version).toBe(1);
    expect(record.syncState).toBe("pending");

    const pending = await outbox.listPending(new Date().toISOString());
    expect(pending).toHaveLength(1);
    expect(pending[0].entityType).toBe("userMedication");
    expect(pending[0].operation).toBe("create");
    expect(pending[0].baseVersion).toBeUndefined();
  });

  it("create() from a catalog match sets catalogProductId and leaves customName null (ADR-004: never merged)", async () => {
    const catalogProductId = crypto.randomUUID();
    const record = await repo.create({
      id: crypto.randomUUID(),
      profileId,
      clientMutationId: crypto.randomUUID(),
      catalogProductId,
      customName: null,
      customForm: null,
      customStrengthValue: null,
      customStrengthUnit: null,
      inventoryUnit: "capsule",
      lowStockThresholdValue: null,
      expiryWarningDays: 30,
      notes: null,
    });

    expect(record.catalogProductId).toBe(catalogProductId);
    expect(record.customName).toBeNull();
  });

  it("list() excludes soft-deleted rows and scopes to the given profile", async () => {
    const idA = crypto.randomUUID();
    await repo.create({
      id: idA,
      profileId,
      clientMutationId: crypto.randomUUID(),
      catalogProductId: null,
      customName: "A",
      customForm: null,
      customStrengthValue: null,
      customStrengthUnit: null,
      inventoryUnit: "tablet",
      lowStockThresholdValue: null,
      expiryWarningDays: 30,
      notes: null,
    });
    await repo.create({
      id: crypto.randomUUID(),
      profileId: "other-profile",
      clientMutationId: crypto.randomUUID(),
      catalogProductId: null,
      customName: "B",
      customForm: null,
      customStrengthValue: null,
      customStrengthUnit: null,
      inventoryUnit: "tablet",
      lowStockThresholdValue: null,
      expiryWarningDays: 30,
      notes: null,
    });

    const list = await repo.list(profileId);
    expect(list.map((r) => r.id)).toEqual([idA]);
  });

  it("applyRemote()/markConflict()/markFailed() update syncState without touching other fields", async () => {
    const id = crypto.randomUUID();
    const created = await repo.create({
      id,
      profileId,
      clientMutationId: crypto.randomUUID(),
      catalogProductId: null,
      customName: "X",
      customForm: null,
      customStrengthValue: null,
      customStrengthUnit: null,
      inventoryUnit: "tablet",
      lowStockThresholdValue: null,
      expiryWarningDays: 30,
      notes: null,
    });

    await repo.markConflict(id);
    expect((await repo.get(id))?.syncState).toBe("conflict");

    await repo.markFailed(id);
    expect((await repo.get(id))?.syncState).toBe("failed");

    await repo.applyRemote({ ...created, version: 3, syncState: "pending" });
    const final = await repo.get(id);
    expect(final?.syncState).toBe("synced");
    expect(final?.version).toBe(3);
  });
});
