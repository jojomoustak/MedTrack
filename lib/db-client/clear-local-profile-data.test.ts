import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { clearAllLocalProfileData, hasPendingLocalWork } from "@/lib/db-client/clear-local-profile-data";

describe("clearAllLocalProfileData", () => {
  let db: MedTrackingDexie;

  beforeEach(async () => {
    db = new MedTrackingDexie(`test-clear-profile-${crypto.randomUUID()}`);

    await db.userMedication.put({
      id: "med-1",
      profileId: "profile-1",
      catalogProductId: null,
      customName: "Ασπιρίνη",
      customForm: null,
      customStrengthValue: null,
      customStrengthUnit: null,
      treatmentState: "active",
      inventoryUnit: "tablet",
      lowStockThresholdValue: null,
      expiryWarningDays: 30,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      deletedAt: null,
      clientMutationId: "cm-1",
      syncState: "synced",
    });
    await db.outbox.put({
      clientMutationId: "cm-2",
      entityType: "purchaseList",
      entityId: "list-1",
      operation: "create",
      payload: { name: "Pharmacy run" },
      createdAt: new Date().toISOString(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date().toISOString(),
    });
    await db.medicationPhotoCache.put({
      userMedicationId: "med-1",
      blob: new Blob(["bytes"]),
      contentType: "image/jpeg",
      byteSize: 5,
      cachedAt: new Date().toISOString(),
      lastViewedAt: new Date().toISOString(),
    });
    await db.photoOutboxEntry.put({
      userMedicationId: "med-1",
      operation: "delete",
      blob: null,
      contentType: null,
      enqueuedAt: new Date().toISOString(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date().toISOString(),
    });
    // Shared catalog/reference data — must survive.
    await db.catalogProductCache.put({
      id: "catalog-1",
      gtin: "12345678901234",
      eofCode: null,
      name: "Depon 500mg",
      nameNormalized: "depon 500mg",
      manufacturer: "Placeholder Pharma",
      activeIngredient: "Παρακεταμόλη",
      strengthValue: "500",
      strengthUnit: "mg",
      form: "tablet",
      packSizeValue: "20",
      packSizeUnit: "tablet",
      regulatorySource: "seed-placeholder-not-verified",
      sourceVersion: "phase6-seed-v1",
      sourceLastUpdated: new Date().toISOString(),
      lifecycleState: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cachedAt: new Date().toISOString(),
    });
    await db.learnedGtinMapping.put({
      gtin: "12345678901234",
      catalogProductId: "catalog-1",
      evidenceType: "USER_CONFIRMED",
      confirmedAt: new Date().toISOString(),
      syncedAt: null,
    });
  });

  afterEach(async () => {
    await db.delete();
  });

  it("clears every profile-scoped table", async () => {
    await clearAllLocalProfileData(db);

    expect(await db.userMedication.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.medicationPhotoCache.count()).toBe(0);
    expect(await db.photoOutboxEntry.count()).toBe(0);
  });

  it("leaves shared catalog/reference data untouched", async () => {
    await clearAllLocalProfileData(db);

    expect(await db.catalogProductCache.count()).toBe(1);
    expect(await db.learnedGtinMapping.count()).toBe(1);
  });
});

describe("hasPendingLocalWork", () => {
  let db: MedTrackingDexie;

  beforeEach(() => {
    db = new MedTrackingDexie(`test-pending-work-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("is false with an empty outbox and photo outbox", async () => {
    expect(await hasPendingLocalWork(db)).toBe(false);
  });

  it("is true when the JSON outbox has an entry", async () => {
    await db.outbox.put({
      clientMutationId: "cm-1",
      entityType: "purchaseList",
      entityId: "list-1",
      operation: "create",
      payload: { name: "Pharmacy run" },
      createdAt: new Date().toISOString(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date().toISOString(),
    });
    expect(await hasPendingLocalWork(db)).toBe(true);
  });

  it("is true when the photo outbox has an entry", async () => {
    await db.photoOutboxEntry.put({
      userMedicationId: "med-1",
      operation: "delete",
      blob: null,
      contentType: null,
      enqueuedAt: new Date().toISOString(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date().toISOString(),
    });
    expect(await hasPendingLocalWork(db)).toBe(true);
  });
});
