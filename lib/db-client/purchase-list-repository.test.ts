import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";
import { DexiePurchaseListRepository } from "@/lib/db-client/purchase-list-repository";

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

    const pending = await outbox.listPending(new Date().toISOString());
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe("create");
    expect(pending[0].baseVersion).toBeUndefined();
  });

  it("rename() bumps the local version optimistically and records baseVersion for the server to check", async () => {
    const id = crypto.randomUUID();
    await repo.create({ id, profileId, name: "Original", clientMutationId: crypto.randomUUID() });
    await outbox.markSynced((await outbox.listPending(new Date().toISOString()))[0].clientMutationId);

    const renameMutationId = crypto.randomUUID();
    const renamed = await repo.rename(id, "Updated", renameMutationId);

    expect(renamed.version).toBe(2);
    expect(renamed.name).toBe("Updated");

    const pending = await outbox.listPending(new Date().toISOString());
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
});
