import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";
import { DexiePurchaseListItemRepository } from "@/lib/db-client/purchase-list-item-repository";

const PROFILE_ID = crypto.randomUUID();
const LIST_ID = crypto.randomUUID();

describe("DexiePurchaseListItemRepository", () => {
  let db: MedTrackingDexie;
  let outbox: DexieOutboxRepository;
  let repo: DexiePurchaseListItemRepository;

  beforeEach(() => {
    db = new MedTrackingDexie(`test-purchase-list-item-${crypto.randomUUID()}`);
    outbox = new DexieOutboxRepository(db);
    repo = new DexiePurchaseListItemRepository(db, outbox);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("create() writes a pending item with status 'pending' and enqueues a create outbox entry with no baseVersion", async () => {
    const item = await repo.create({
      id: crypto.randomUUID(),
      clientMutationId: crypto.randomUUID(),
      purchaseListId: LIST_ID,
      profileId: PROFILE_ID,
      label: "Vitamin D",
    });

    expect(item.status).toBe("pending");
    expect(item.version).toBe(1);
    expect(item.syncState).toBe("pending");
    expect(item.userMedicationId).toBeNull();
    expect(item.currency).toBe("EUR");

    const pending = await outbox.listPending(new Date().toISOString());
    expect(pending).toHaveLength(1);
    expect(pending[0].entityType).toBe("purchaseListItem");
    expect(pending[0].operation).toBe("create");
    expect(pending[0].baseVersion).toBeUndefined();
  });

  it("create() rejects an item with neither a label nor a userMedicationId (chk_item_has_label)", async () => {
    await expect(
      repo.create({
        id: crypto.randomUUID(),
        clientMutationId: crypto.randomUUID(),
        purchaseListId: LIST_ID,
        profileId: PROFILE_ID,
      }),
    ).rejects.toThrow();
  });

  it("create() accepts an item linked to a userMedicationId with no label", async () => {
    const item = await repo.create({
      id: crypto.randomUUID(),
      clientMutationId: crypto.randomUUID(),
      purchaseListId: LIST_ID,
      profileId: PROFILE_ID,
      userMedicationId: crypto.randomUUID(),
    });
    expect(item.label).toBeNull();
  });

  it("update() bumps version, enqueues an update outbox entry carrying baseVersion, and sends only the changed fields as payload", async () => {
    const created = await repo.create({
      id: crypto.randomUUID(),
      clientMutationId: crypto.randomUUID(),
      purchaseListId: LIST_ID,
      profileId: PROFILE_ID,
      label: "Vitamin D",
    });

    const updated = await repo.update(created.id, { estimatedUnitPriceCents: 500 }, crypto.randomUUID());

    expect(updated.version).toBe(2);
    expect(updated.estimatedUnitPriceCents).toBe(500);
    expect(updated.label).toBe("Vitamin D"); // untouched field survives

    const pending = await outbox.listPending(new Date().toISOString());
    const updateEntry = pending.find((e) => e.operation === "update");
    expect(updateEntry?.baseVersion).toBe(1);
    expect(updateEntry?.payload).toEqual({ estimatedUnitPriceCents: 500 });
  });

  it("update() to status 'purchased' with purchasedAt and actualPaidPriceCents", async () => {
    const created = await repo.create({
      id: crypto.randomUUID(),
      clientMutationId: crypto.randomUUID(),
      purchaseListId: LIST_ID,
      profileId: PROFILE_ID,
      label: "Vitamin D",
    });

    const purchasedAt = new Date().toISOString();
    const updated = await repo.update(created.id, { status: "purchased", purchasedAt, actualPaidPriceCents: 450 }, crypto.randomUUID());

    expect(updated.status).toBe("purchased");
    expect(updated.purchasedAt).toBe(purchasedAt);
    expect(updated.actualPaidPriceCents).toBe(450);
  });

  it("remove() soft-deletes the row (tombstone) and enqueues a delete outbox entry", async () => {
    const created = await repo.create({
      id: crypto.randomUUID(),
      clientMutationId: crypto.randomUUID(),
      purchaseListId: LIST_ID,
      profileId: PROFILE_ID,
      label: "Vitamin D",
    });

    const removed = await repo.remove(created.id, crypto.randomUUID());
    expect(removed.deletedAt).not.toBeNull();
    expect(removed.version).toBe(2);

    const pending = await outbox.listPending(new Date().toISOString());
    const deleteEntry = pending.find((e) => e.operation === "delete");
    expect(deleteEntry?.baseVersion).toBe(1);
  });

  it("listByPurchaseList() excludes soft-deleted rows and rows from a different list", async () => {
    const kept = await repo.create({ id: crypto.randomUUID(), clientMutationId: crypto.randomUUID(), purchaseListId: LIST_ID, profileId: PROFILE_ID, label: "Kept" });
    const removed = await repo.create({ id: crypto.randomUUID(), clientMutationId: crypto.randomUUID(), purchaseListId: LIST_ID, profileId: PROFILE_ID, label: "Removed" });
    await repo.create({ id: crypto.randomUUID(), clientMutationId: crypto.randomUUID(), purchaseListId: crypto.randomUUID(), profileId: PROFILE_ID, label: "Elsewhere" });
    await repo.remove(removed.id, crypto.randomUUID());

    const items = await repo.listByPurchaseList(LIST_ID);
    expect(items.map((i) => i.id)).toEqual([kept.id]);
  });

  it("applyRemote() converges a local row to the server's record and marks it synced", async () => {
    const created = await repo.create({
      id: crypto.randomUUID(),
      clientMutationId: crypto.randomUUID(),
      purchaseListId: LIST_ID,
      profileId: PROFILE_ID,
      label: "Vitamin D",
    });

    await repo.applyRemote({ ...created, status: "purchased", version: 2, syncState: "pending" });

    const final = await repo.get(created.id);
    expect(final?.status).toBe("purchased");
    expect(final?.syncState).toBe("synced");
  });

  it("markConflict() and markFailed() only touch syncState", async () => {
    const created = await repo.create({
      id: crypto.randomUUID(),
      clientMutationId: crypto.randomUUID(),
      purchaseListId: LIST_ID,
      profileId: PROFILE_ID,
      label: "Vitamin D",
    });

    await repo.markConflict(created.id);
    expect((await repo.get(created.id))?.syncState).toBe("conflict");

    await repo.markFailed(created.id);
    expect((await repo.get(created.id))?.syncState).toBe("failed");
  });
});
