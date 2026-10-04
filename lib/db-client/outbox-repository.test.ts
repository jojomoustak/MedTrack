import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";
import { SYNCING_LEASE_MS, type OutboxEntry } from "@/lib/domain/outbox";

function makeEntry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    clientMutationId: crypto.randomUUID(),
    entityType: "purchaseList",
    entityId: crypto.randomUUID(),
    operation: "create",
    payload: { name: "Pharmacy run" },
    profileId: "profile-1",
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
    const pending = await repo.listPending(new Date().toISOString(), "profile-1");
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

    const pending = await repo.listPending(new Date().toISOString(), "profile-1");
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

    const pending = await repo.listPending(new Date().toISOString(), "profile-1");
    expect(pending.map((e) => e.clientMutationId)).toEqual([first.clientMutationId, second.clientMutationId, third.clientMutationId]);
  });

  it("listPending excludes entries whose nextAttemptAt is still in the future (backoff)", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    await repo.enqueue(makeEntry({ nextAttemptAt: future }));
    const pending = await repo.listPending(new Date().toISOString(), "profile-1");
    expect(pending).toHaveLength(0);
  });

  it("listPending excludes entries currently syncing", async () => {
    const entry = makeEntry();
    await repo.enqueue(entry);
    await repo.markSyncing(entry.clientMutationId);
    const pending = await repo.listPending(new Date().toISOString(), "profile-1");
    expect(pending).toHaveLength(0);
  });

  it("listPending retries a syncing entry whose lease has expired (the app was killed mid-request)", async () => {
    // Real bug (2026-10-04): only a request's own success/failure handlers
    // move an entry out of `syncing`, so an app killed mid-request left the
    // entry stranded forever and its change never reached the server.
    const entry = makeEntry();
    await repo.enqueue(entry);
    await repo.markSyncing(entry.clientMutationId);

    const justBeforeExpiry = new Date(Date.now() + SYNCING_LEASE_MS - 5_000).toISOString();
    expect(await repo.listPending(justBeforeExpiry, "profile-1")).toHaveLength(0);

    const afterExpiry = new Date(Date.now() + SYNCING_LEASE_MS + 1_000).toISOString();
    const pending = await repo.listPending(afterExpiry, "profile-1");
    expect(pending.map((e) => e.clientMutationId)).toEqual([entry.clientMutationId]);
  });

  it("listPending retries a syncing entry stored before leases existed (no syncingSince)", async () => {
    // Such an entry can only have been left behind by an earlier app
    // version's dead JS context — it can't still be in flight.
    const entry = makeEntry({ status: "syncing" });
    await repo.enqueue(entry);
    const pending = await repo.listPending(new Date().toISOString(), "profile-1");
    expect(pending.map((e) => e.clientMutationId)).toEqual([entry.clientMutationId]);
  });

  it("listPending only returns the given profile's entries, never another profile's", async () => {
    // Security review (2026-10-04): sign-out keeps unsent entries so nothing
    // is lost, so a shared device's queue can hold a previous user's changes
    // — they must never be sent under the next user's session.
    const mine = makeEntry({ profileId: "profile-1" });
    await repo.enqueue(mine);
    await repo.enqueue(makeEntry({ profileId: "profile-2" }));

    const pending = await repo.listPending(new Date().toISOString(), "profile-1");
    expect(pending.map((e) => e.clientMutationId)).toEqual([mine.clientMutationId]);
  });

  it("listPending attributes an unstamped (pre-upgrade) entry by its payload's profileId, and holds one with no owner at all", async () => {
    const legacyMine = makeEntry({ profileId: undefined, payload: { profileId: "profile-1" } });
    const legacyOther = makeEntry({ profileId: undefined, payload: { profileId: "profile-2" } });
    const ownerless = makeEntry({ profileId: undefined, payload: { name: "?" } });
    for (const e of [legacyMine, legacyOther, ownerless]) await db.outbox.add(e);

    const pending = await repo.listPending(new Date().toISOString(), "profile-1");
    expect(pending.map((e) => e.clientMutationId)).toEqual([legacyMine.clientMutationId]);
  });

  it("listPending holds back later entries for an entity whose earlier entry is still in flight", async () => {
    // Otherwise a newer change could be delivered before an older one still
    // being sent, and the older one would then overwrite it server-side.
    const entityId = crypto.randomUUID();
    const first = makeEntry({ entityId, seq: 1 });
    const second = makeEntry({ entityId, seq: 2 });
    const unrelated = makeEntry({ seq: 3 });
    for (const e of [first, second, unrelated]) await repo.enqueue(e);
    await repo.markSyncing(first.clientMutationId);

    const pending = await repo.listPending(new Date().toISOString(), "profile-1");
    expect(pending.map((e) => e.clientMutationId)).toEqual([unrelated.clientMutationId]);

    const afterExpiry = new Date(Date.now() + SYNCING_LEASE_MS + 1_000).toISOString();
    const afterLease = await repo.listPending(afterExpiry, "profile-1");
    expect(afterLease.map((e) => e.clientMutationId)).toEqual([first.clientMutationId, second.clientMutationId, unrelated.clientMutationId]);
  });

  it("stamps every new entry with its owning profile — from the payload, else the signed-in profile", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ profileId: "signed-in", accountId: "acct" }),
      setItem: () => {},
      removeItem: () => {},
    });
    try {
      const fromPayload = makeEntry({ profileId: undefined, payload: { profileId: "profile-1" } });
      const fromSession = makeEntry({ profileId: undefined, payload: { theme: "dark" } });
      await repo.enqueue(fromPayload);
      await repo.enqueue(fromSession);

      expect((await db.outbox.get(fromPayload.clientMutationId))?.profileId).toBe("profile-1");
      expect((await db.outbox.get(fromSession.clientMutationId))?.profileId).toBe("signed-in");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("markSynced removes the entry entirely", async () => {
    const entry = makeEntry();
    await repo.enqueue(entry);
    await repo.markSynced(entry.clientMutationId);
    const pending = await repo.listPending(new Date().toISOString(), "profile-1");
    expect(pending).toHaveLength(0);
  });

  it("markFailed records the error, bumps attempts, and reschedules for later", async () => {
    const entry = makeEntry();
    await repo.enqueue(entry);
    const later = new Date(Date.now() + 10_000).toISOString();
    await repo.markFailed(entry.clientMutationId, "network error", later);

    const notYetDue = await repo.listPending(new Date().toISOString(), "profile-1");
    expect(notYetDue).toHaveLength(0);

    const dueLater = await repo.listPending(later, "profile-1");
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
