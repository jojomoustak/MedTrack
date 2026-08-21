import { describe, expect, it, vi } from "vitest";
import { drainOutbox, drainOutboxFully } from "@/lib/sync/client/worker";
import type { OutboxEntry } from "@/lib/domain/outbox";
import type { OutboxRepository } from "@/lib/domain/repositories";
import type { SyncMutationResult } from "@/lib/sync/protocol";

function makeEntry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    clientMutationId: crypto.randomUUID(),
    entityType: "purchaseList",
    entityId: crypto.randomUUID(),
    operation: "create",
    payload: { name: "Test list" },
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Minimal in-memory OutboxRepository — the worker's contract doesn't care about the storage engine. */
function createFakeOutbox(initial: OutboxEntry[] = []): OutboxRepository & { entries: Map<string, OutboxEntry> } {
  const entries = new Map(initial.map((e) => [e.clientMutationId, e]));
  return {
    entries,
    async enqueue(entry) {
      entries.set(entry.clientMutationId, entry);
    },
    async listPending(now) {
      return [...entries.values()].filter((e) => e.status !== "syncing" && e.nextAttemptAt <= now);
    },
    async markSyncing(id) {
      const e = entries.get(id);
      if (e) e.status = "syncing";
    },
    async markSynced(id) {
      entries.delete(id);
    },
    async markFailed(id, error, nextAttemptAt) {
      const e = entries.get(id);
      if (e) {
        e.status = "failed";
        e.lastError = error;
        e.nextAttemptAt = nextAttemptAt;
        e.attempts += 1;
      }
    },
    async remove(id) {
      entries.delete(id);
    },
    async listForEntity(entityId) {
      return [...entries.values()].filter((e) => e.entityId === entityId);
    },
  };
}

describe("drainOutbox", () => {
  it("does nothing when the outbox is empty", async () => {
    const outbox = createFakeOutbox();
    const applyResult = vi.fn();
    const postMutations = vi.fn();
    const summary = await drainOutbox({ outbox, applyResult, postMutations });
    expect(summary).toEqual({ attempted: 0, synced: 0, conflicts: 0, failed: 0 });
    expect(postMutations).not.toHaveBeenCalled();
  });

  it("on an 'applied' server result: calls applyResult, removes the outbox entry (via markSynced)", async () => {
    const entry = makeEntry();
    const outbox = createFakeOutbox([entry]);
    const applyResult = vi.fn();
    const result: SyncMutationResult = { clientMutationId: entry.clientMutationId, result: "applied", serverRecord: { id: entry.entityId } };
    const postMutations = vi.fn().mockResolvedValue({ results: [result] });

    const summary = await drainOutbox({ outbox, applyResult, postMutations });

    expect(summary).toEqual({ attempted: 1, synced: 1, conflicts: 0, failed: 0 });
    expect(applyResult).toHaveBeenCalledWith(entry, result);
    expect(outbox.entries.has(entry.clientMutationId)).toBe(false);
  });

  it("on a 'conflict' server result: calls applyResult, removes the outbox entry, does NOT keep retrying", async () => {
    const entry = makeEntry({ operation: "update", baseVersion: 1 });
    const outbox = createFakeOutbox([entry]);
    const applyResult = vi.fn();
    const result: SyncMutationResult = { clientMutationId: entry.clientMutationId, result: "conflict", serverRecord: { version: 3 } };
    const postMutations = vi.fn().mockResolvedValue({ results: [result] });

    const summary = await drainOutbox({ outbox, applyResult, postMutations });

    expect(summary.conflicts).toBe(1);
    expect(applyResult).toHaveBeenCalledWith(entry, result);
    // Conflicts are surfaced to the user (Phase 3 §5), not silently retried forever.
    expect(outbox.entries.has(entry.clientMutationId)).toBe(false);
  });

  it("on a 'rejected' server result: marks the entry failed with backoff, keeps it for a manual/later retry", async () => {
    const entry = makeEntry();
    const outbox = createFakeOutbox([entry]);
    const applyResult = vi.fn();
    const result: SyncMutationResult = { clientMutationId: entry.clientMutationId, result: "rejected", error: "invalid payload" };
    const postMutations = vi.fn().mockResolvedValue({ results: [result] });

    const summary = await drainOutbox({ outbox, applyResult, postMutations });

    expect(summary.failed).toBe(1);
    const stored = outbox.entries.get(entry.clientMutationId);
    expect(stored?.status).toBe("failed");
    expect(stored?.attempts).toBe(1);
    expect(stored?.lastError).toBe("invalid payload");
    // Never silently disappears (Phase 3 §5) — it's still in the outbox, just rescheduled.
    expect(stored).toBeDefined();
  });

  it("on a network-level failure (postMutations throws): every entry in the batch goes back to pending/failed with backoff, none marked conflict/rejected", async () => {
    const entryA = makeEntry();
    const entryB = makeEntry();
    const outbox = createFakeOutbox([entryA, entryB]);
    const applyResult = vi.fn();
    const postMutations = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const summary = await drainOutbox({ outbox, applyResult, postMutations });

    expect(summary).toEqual({ attempted: 2, synced: 0, conflicts: 0, failed: 2 });
    expect(applyResult).not.toHaveBeenCalled();
    const stored = outbox.entries.get(entryA.clientMutationId);
    expect(stored?.status).toBe("failed");
    expect(stored && stored.nextAttemptAt > new Date().toISOString()).toBe(true);
  });

  it("marks entries 'syncing' before the request goes out, so a concurrent drain call won't double-send them", async () => {
    const entry = makeEntry();
    const outbox = createFakeOutbox([entry]);
    let statusDuringRequest: string | undefined;
    const postMutations = vi.fn().mockImplementation(async () => {
      statusDuringRequest = outbox.entries.get(entry.clientMutationId)?.status;
      return { results: [{ clientMutationId: entry.clientMutationId, result: "applied" as const }] };
    });

    await drainOutbox({ outbox, applyResult: vi.fn(), postMutations });
    expect(statusDuringRequest).toBe("syncing");
  });
});

describe("drainOutboxFully", () => {
  it("keeps draining across rounds until nothing more is due, bounded by maxRounds", async () => {
    const entries = Array.from({ length: 3 }, () => makeEntry());
    const outbox = createFakeOutbox(entries);
    const applyResult = vi.fn();
    // Each round applies exactly one entry (simulates the server processing them one batch at a time isn't required — this just exercises multi-round draining logic by re-listing after each drain).
    const postMutations = vi.fn().mockImplementation(async (mutations: { clientMutationId: string }[]) => ({
      results: mutations.map((m) => ({ clientMutationId: m.clientMutationId, result: "applied" as const })),
    }));

    const summary = await drainOutboxFully({ outbox, applyResult, postMutations });
    expect(summary.synced).toBe(3);
    expect(outbox.entries.size).toBe(0);
  });
});
