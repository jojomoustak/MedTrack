import { describe, expect, it, vi } from "vitest";
import { drainPhotoOutbox } from "@/lib/medications/client/photo-outbox-worker";
import type { PhotoCacheEntry, PhotoCacheRepository, PhotoOutboxEnqueueInput, PhotoOutboxOperation, PhotoOutboxRepository } from "@/lib/domain/repositories";

interface FakeEntry {
  userMedicationId: string;
  operation: PhotoOutboxOperation;
  blob: Blob | null;
  contentType: string | null;
  enqueuedAt: string;
  status: "pending" | "syncing" | "failed";
  attempts: number;
  nextAttemptAt: string;
}

function blob(): Blob {
  return new Blob(["bytes"], { type: "image/jpeg" });
}

/** Minimal in-memory PhotoOutboxRepository — the worker's contract doesn't care about the storage engine. */
function createFakeOutbox(initial: FakeEntry[] = []): PhotoOutboxRepository & { entries: Map<string, FakeEntry> } {
  const entries = new Map(initial.map((e) => [e.userMedicationId, e]));
  return {
    entries,
    async enqueue(input: PhotoOutboxEnqueueInput) {
      entries.set(input.userMedicationId, {
        userMedicationId: input.userMedicationId,
        operation: input.operation,
        blob: input.blob ?? null,
        contentType: input.contentType ?? null,
        // Guaranteed distinct from any pre-seeded `initial` entry's
        // enqueuedAt (those use plain "enq-N" strings in these tests) —
        // a counter here would risk colliding with one of those instead.
        enqueuedAt: `enq-${crypto.randomUUID()}`,
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date().toISOString(),
      });
    },
    async get(id) {
      const e = entries.get(id);
      return e ? { operation: e.operation, enqueuedAt: e.enqueuedAt } : null;
    },
    async listPending(now) {
      return [...entries.values()]
        .filter((e) => e.status !== "syncing" && e.nextAttemptAt <= now)
        .map((e) => ({ userMedicationId: e.userMedicationId, operation: e.operation, blob: e.blob, contentType: e.contentType, enqueuedAt: e.enqueuedAt, attempts: e.attempts }));
    },
    async markSyncing(id) {
      const e = entries.get(id);
      if (e) e.status = "syncing";
    },
    async markFailed(id, error, nextAttemptAt) {
      const e = entries.get(id);
      if (e) {
        e.status = "failed";
        e.nextAttemptAt = nextAttemptAt;
        e.attempts += 1;
      }
    },
    async clearIfUnchanged(id, enqueuedAt) {
      const e = entries.get(id);
      if (!e || e.enqueuedAt !== enqueuedAt) return false;
      entries.delete(id);
      return true;
    },
  };
}

function createFakeCache(): PhotoCacheRepository & { store: Map<string, PhotoCacheEntry> } {
  const store = new Map<string, PhotoCacheEntry>();
  return {
    store,
    async get(id) {
      return store.get(id) ?? null;
    },
    async touch() {},
    async put(entry) {
      store.set(entry.userMedicationId, entry);
    },
    async remove(id) {
      store.delete(id);
    },
  };
}

describe("drainPhotoOutbox", () => {
  it("does nothing when the outbox is empty", async () => {
    const outbox = createFakeOutbox();
    const cache = createFakeCache();
    const summary = await drainPhotoOutbox({ outbox, cache, uploadPhoto: vi.fn(), deletePhoto: vi.fn() });
    expect(summary).toEqual({ attempted: 0, synced: 0, failed: 0 });
  });

  it("uploads a queued entry, caches the result, and clears the outbox entry on success", async () => {
    const outbox = createFakeOutbox([
      { userMedicationId: "med-1", operation: "upload", blob: blob(), contentType: "image/jpeg", enqueuedAt: "enq-0", status: "pending", attempts: 0, nextAttemptAt: new Date().toISOString() },
    ]);
    const cache = createFakeCache();
    const uploadPhoto = vi.fn().mockResolvedValue(undefined);

    const summary = await drainPhotoOutbox({ outbox, cache, uploadPhoto, deletePhoto: vi.fn() });

    expect(summary).toEqual({ attempted: 1, synced: 1, failed: 0 });
    expect(uploadPhoto).toHaveBeenCalledWith("med-1", expect.any(Blob));
    expect(cache.store.has("med-1")).toBe(true);
    expect(outbox.entries.has("med-1")).toBe(false);
  });

  it("deletes a queued entry, clears the cache, and clears the outbox entry on success", async () => {
    const outbox = createFakeOutbox([
      { userMedicationId: "med-1", operation: "delete", blob: null, contentType: null, enqueuedAt: "enq-0", status: "pending", attempts: 0, nextAttemptAt: new Date().toISOString() },
    ]);
    const cache = createFakeCache();
    cache.store.set("med-1", { userMedicationId: "med-1", blob: blob(), contentType: "image/jpeg" });
    const deletePhoto = vi.fn().mockResolvedValue(undefined);

    const summary = await drainPhotoOutbox({ outbox, cache, uploadPhoto: vi.fn(), deletePhoto });

    expect(summary).toEqual({ attempted: 1, synced: 1, failed: 0 });
    expect(deletePhoto).toHaveBeenCalledWith("med-1");
    expect(cache.store.has("med-1")).toBe(false);
    expect(outbox.entries.has("med-1")).toBe(false);
  });

  it("marks the entry failed with backoff when the network request rejects", async () => {
    const outbox = createFakeOutbox([
      { userMedicationId: "med-1", operation: "upload", blob: blob(), contentType: "image/jpeg", enqueuedAt: "enq-0", status: "pending", attempts: 0, nextAttemptAt: new Date().toISOString() },
    ]);
    const cache = createFakeCache();
    const uploadPhoto = vi.fn().mockRejectedValue(new Error("offline"));

    const summary = await drainPhotoOutbox({ outbox, cache, uploadPhoto, deletePhoto: vi.fn() });

    expect(summary).toEqual({ attempted: 1, synced: 0, failed: 1 });
    const entry = outbox.entries.get("med-1");
    expect(entry?.status).toBe("failed");
    expect(entry?.attempts).toBe(1);
    expect(new Date(entry!.nextAttemptAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("does not clear (or count as synced/failed) an entry that was superseded by a newer enqueue mid-flight", async () => {
    const outbox = createFakeOutbox([
      { userMedicationId: "med-1", operation: "upload", blob: blob(), contentType: "image/jpeg", enqueuedAt: "enq-0", status: "pending", attempts: 0, nextAttemptAt: new Date().toISOString() },
    ]);
    const cache = createFakeCache();
    // Simulates a new enqueue landing while the upload request is in flight.
    const uploadPhoto = vi.fn().mockImplementation(async () => {
      await outbox.enqueue({ userMedicationId: "med-1", operation: "delete" });
    });

    const summary = await drainPhotoOutbox({ outbox, cache, uploadPhoto, deletePhoto: vi.fn() });

    expect(summary).toEqual({ attempted: 1, synced: 0, failed: 0 });
    const survivor = outbox.entries.get("med-1");
    expect(survivor?.operation).toBe("delete"); // the newer entry, untouched
  });
});
