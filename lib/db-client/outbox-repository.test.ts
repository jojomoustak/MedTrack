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

  it("listPending orders entries by createdAt ascending, regardless of their (random-UUID) primary key order", async () => {
    // Real bug (2026-08-30, Phase 10): without an explicit order, Dexie
    // iterates in primary-key order, and clientMutationId (the primary
    // key) is a random UUID -- so a later-created entry could sort
    // BEFORE an earlier one that it actually depends on server-side
    // (e.g. a DoseEvent create before its own MedicationSchedule's
    // create). Deliberately enqueues out of createdAt order here to
    // prove the fix doesn't just accidentally work because of insertion
    // order.
    const early = makeEntry({ createdAt: "2026-01-01T00:00:00.000Z" });
    const late = makeEntry({ createdAt: "2026-01-02T00:00:00.000Z" });
    await repo.enqueue(late);
    await repo.enqueue(early);

    const pending = await repo.listPending(new Date().toISOString());
    expect(pending.map((e) => e.clientMutationId)).toEqual([early.clientMutationId, late.clientMutationId]);
  });

  it("listPending orders same-millisecond entries by seq, not primary-key order", async () => {
    // Follow-up bug (2026-08-30, Phase 10, found re-verifying the fix
    // above on a real device): AddMedicationFlow creates a
    // MedicationSchedule immediately followed by several generated
    // DoseEvents, easily landing on the SAME millisecond -- a createdAt
    // string sort degrades back to primary-key order on that tie,
    // reproducing the exact bug the createdAt sort was meant to fix.
    // `seq` (a locally-assigned strictly-increasing counter) doesn't tie.
    const sameMs = "2026-01-01T00:00:00.000Z";
    const first = makeEntry({ createdAt: sameMs, seq: 100 });
    const second = makeEntry({ createdAt: sameMs, seq: 101 });
    const third = makeEntry({ createdAt: sameMs, seq: 102 });
    // Enqueue in reverse seq order so a primary-key/insertion-order sort
    // would get this wrong.
    await repo.enqueue(third);
    await repo.enqueue(first);
    await repo.enqueue(second);

    const pending = await repo.listPending(new Date().toISOString());
    expect(pending.map((e) => e.clientMutationId)).toEqual([first.clientMutationId, second.clientMutationId, third.clientMutationId]);
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
