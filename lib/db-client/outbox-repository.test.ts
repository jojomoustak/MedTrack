import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";
import type { OutboxEntry } from "@/lib/domain/outbox";

function makeEntry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    clientMutationId: crypto.randomUUID(),
    entityType: "purchaseList",
    entityId: crypto.randomUUID(),
    operation: "create",
    payload: { name: "Pharmacy run" },
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("DexieOutboxRepository", () => {
  let db: MedTrackingDexie;
  let repo: DexieOutboxRepository;

  beforeEach(() => {
    db = new MedTrackingDexie(`test-outbox-${crypto.randomUUID()}`);
    repo = new DexieOutboxRepository(db);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("enqueue + listPending round-trips a due entry", async () => {
    const entry = makeEntry();
    await repo.enqueue(entry);
    const pending = await repo.listPending(new Date().toISOString());
    expect(pending).toHaveLength(1);
    expect(pending[0].clientMutationId).toBe(entry.clientMutationId);
  });

  it("listPending excludes entries whose nextAttemptAt is still in the future (backoff)", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    await repo.enqueue(makeEntry({ nextAttemptAt: future }));
    const pending = await repo.listPending(new Date().toISOString());
    expect(pending).toHaveLength(0);
  });

  it("listPending excludes entries currently syncing", async () => {
    const entry = makeEntry();
    await repo.enqueue(entry);
    await repo.markSyncing(entry.clientMutationId);
    const pending = await repo.listPending(new Date().toISOString());
    expect(pending).toHaveLength(0);
  });

  it("markSynced removes the entry entirely", async () => {
    const entry = makeEntry();
    await repo.enqueue(entry);
    await repo.markSynced(entry.clientMutationId);
    const pending = await repo.listPending(new Date().toISOString());
    expect(pending).toHaveLength(0);
  });

  it("markFailed records the error, bumps attempts, and reschedules for later", async () => {
    const entry = makeEntry();
    await repo.enqueue(entry);
    const later = new Date(Date.now() + 10_000).toISOString();
    await repo.markFailed(entry.clientMutationId, "network error", later);

    const notYetDue = await repo.listPending(new Date().toISOString());
    expect(notYetDue).toHaveLength(0);

    const dueLater = await repo.listPending(later);
    expect(dueLater).toHaveLength(1);
    expect(dueLater[0].attempts).toBe(1);
    expect(dueLater[0].lastError).toBe("network error");
  });

  it("listForEntity finds entries for a specific entity id", async () => {
    const entityId = crypto.randomUUID();
    await repo.enqueue(makeEntry({ entityId }));
    await repo.enqueue(makeEntry());

    const forEntity = await repo.listForEntity(entityId);
    expect(forEntity).toHaveLength(1);
    expect(forEntity[0].entityId).toBe(entityId);
  });
});
