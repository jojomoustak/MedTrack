import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";
import { DexiePurchaseListRepository } from "@/lib/db-client/purchase-list-repository";
import { DexiePurchaseListItemRepository } from "@/lib/db-client/purchase-list-item-repository";

describe("DexiePurchaseListRepository (optimistic concurrency)", () => {
  let db: MedTrackingDexie;
  let repo: DexiePurchaseListRepository;
  let outbox: DexieOutboxRepository;
  const profileId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    db = new MedTrackingDexie(`test-lists-${crypto.randomUUID()}`);
    outbox = new DexieOutboxRepository(db);
    repo = new DexiePurchaseListRepository(db, outbox);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("create() writes the record at version 1 and enqueues a create outbox entry with no baseVersion", async () => {
    const id = crypto.randomUUID();
    const clientMutationId = crypto.randomUUID();
    const record = await repo.create({ id, profileId, name: "Φαρμακείο", clientMutationId });

    expect(record.version).toBe(1);
    expect(record.syncState).toBe("pending");

    const pending = await outbox.listPending(new Date().toISOString(), profileId);
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe("create");
    expect(pending[0].baseVersion).toBeUndefined();
  });

  it("rename() bumps the local version optimistically and records baseVersion for the server to check", async () => {
    const id = crypto.randomUUID();
    await repo.create({ id, profileId, name: "Original", clientMutationId: crypto.randomUUID() });
    await outbox.markSynced((await outbox.listPending(new Date().toISOString(), profileId))[0].clientMutationId);

    const renameMutationId = crypto.randomUUID();
    const renamed = await repo.rename(id, "Updated", renameMutationId);

    expect(renamed.version).toBe(2);
    expect(renamed.name).toBe("Updated");

    const pending = await outbox.listPending(new Date().toISOString(), profileId);
    expect(pending).toHaveLength(1);
    expect(pending[0].baseVersion).toBe(1); // the version this edit was BUILT ON, not the new local version
    expect(pending[0].operation).toBe("update");
  });

  it("rename() throws for a list that doesn't exist locally", async () => {
    await expect(repo.rename(crypto.randomUUID(), "x", crypto.randomUUID())).rejects.toThrow();
  });

  it("list() excludes soft-deleted rows and scopes to the given profile", async () => {
    const idA = crypto.randomUUID();
    await repo.create({ id: idA, profileId, name: "A", clientMutationId: crypto.randomUUID() });
    await repo.create({ id: crypto.randomUUID(), profileId: "other-profile", name: "B", clientMutationId: crypto.randomUUID() });

    const lists = await repo.list(profileId);
    expect(lists.map((l) => l.id)).toEqual([idA]);
  });

  it("markConflict / markFailed set the expected syncState without touching other fields", async () => {
    const id = crypto.randomUUID();
    const record = await repo.create({ id, profileId, name: "X", clientMutationId: crypto.randomUUID() });

    await repo.markConflict(id);
    expect((await repo.get(id))?.syncState).toBe("conflict");
    expect((await repo.get(id))?.name).toBe(record.name);

    await repo.markFailed(id);
    expect((await repo.get(id))?.syncState).toBe("failed");
  });

  it("applyRemote() overwrites local state with the server's record and marks it synced", async () => {
    const id = crypto.randomUUID();
    await repo.create({ id, profileId, name: "Local name", clientMutationId: crypto.randomUUID() });

    await repo.applyRemote({
      id,
      profileId,
      name: "Server-authoritative name",
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 5,
      deletedAt: null,
      clientMutationId: crypto.randomUUID(),
      syncState: "pending",
    });

    const stored = await repo.get(id);
    expect(stored?.name).toBe("Server-authoritative name");
    expect(stored?.version).toBe(5);
    expect(stored?.syncState).toBe("synced");
  });

  describe("remove() (2026-10-17: lists couldn't be deleted)", () => {
    async function listWithItems(name: string, labels: string[]) {
      const id = crypto.randomUUID();
      await repo.create({ id, profileId, name, clientMutationId: crypto.randomUUID() });
      const items = new DexiePurchaseListItemRepository(db, outbox);
      const created = [];
      for (const label of labels) {
        created.push(await items.create({ id: crypto.randomUUID(), clientMutationId: crypto.randomUUID(), purchaseListId: id, label, profileId }));
      }
      return { id, items: created };
    }

    it("tombstones the list and every item on it, and sends one delete for the list", async () => {
      const target = await listWithItems("Φαρμακείο", ["Algofren", "Βαμβάκι"]);
      const other = await listWithItems("Σούπερ μάρκετ", ["Γάλα"]);
      const before = (await outbox.listPending(new Date().toISOString(), profileId)).length;

      const deleteMutationId = crypto.randomUUID();
      const deleted = await repo.remove(target.id, deleteMutationId);

      expect(deleted).toMatchObject({ syncState: "pending", version: 2, clientMutationId: deleteMutationId });
      expect(deleted.deletedAt).not.toBeNull();
      expect((await repo.list(profileId)).map((l) => l.name)).toEqual(["Σούπερ μάρκετ"]);

      const targetItems = await db.purchaseListItem.where("purchaseListId").equals(target.id).toArray();
      expect(targetItems.every((item) => item.deletedAt === deleted.deletedAt && item.version === 2)).toBe(true);
      const otherItems = await db.purchaseListItem.where("purchaseListId").equals(other.id).toArray();
      expect(otherItems.map((item) => item.deletedAt)).toEqual([null]);

      const pending = await outbox.listPending(new Date().toISOString(), profileId);
      expect(pending).toHaveLength(before + 1);
      const entry = pending.find((e) => e.clientMutationId === deleteMutationId);
      expect(entry).toMatchObject({ entityType: "purchaseList", entityId: target.id, operation: "delete", profileId, payload: {} });
    });

    it("leaves an item that was already deleted as it was", async () => {
      const target = await listWithItems("Φαρμακείο", ["Algofren"]);
      await new DexiePurchaseListItemRepository(db, outbox).remove(target.items[0].id, crypto.randomUUID());
      const removedAt = (await db.purchaseListItem.get(target.items[0].id))?.deletedAt;

      await repo.remove(target.id, crypto.randomUUID());

      const item = await db.purchaseListItem.get(target.items[0].id);
      expect(item?.deletedAt).toBe(removedAt);
      expect(item?.version).toBe(2);
    });

    it("throws for a list that doesn't exist locally, writing nothing", async () => {
      await expect(repo.remove(crypto.randomUUID(), crypto.randomUUID())).rejects.toThrow("not found locally");
      expect(await outbox.listPending(new Date().toISOString(), profileId)).toHaveLength(0);
    });
  });
});
