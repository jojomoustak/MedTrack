import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexiePhotoOutboxRepository } from "@/lib/medications/client/photo-outbox-repository";

function blob(): Blob {
  return new Blob(["bytes"], { type: "image/jpeg" });
}

describe("DexiePhotoOutboxRepository", () => {
  let db: MedTrackingDexie;
  let repo: DexiePhotoOutboxRepository;

  beforeEach(() => {
    db = new MedTrackingDexie(`test-photo-outbox-${crypto.randomUUID()}`);
    repo = new DexiePhotoOutboxRepository(db);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("enqueue + listPending round-trips a due upload entry", async () => {
    await repo.enqueue({ userMedicationId: "med-1", operation: "upload", blob: blob(), contentType: "image/jpeg" });
    const pending = await repo.listPending(new Date().toISOString());
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe("upload");
    expect(pending[0].blob).not.toBeNull();
  });

  it("a delete entry carries no blob", async () => {
    await repo.enqueue({ userMedicationId: "med-1", operation: "delete" });
    const pending = await repo.listPending(new Date().toISOString());
    expect(pending[0].operation).toBe("delete");
    expect(pending[0].blob).toBeNull();
  });

  it("a second enqueue for the same medication supersedes the first (last enqueued wins)", async () => {
    await repo.enqueue({ userMedicationId: "med-1", operation: "upload", blob: blob(), contentType: "image/jpeg" });
    await repo.enqueue({ userMedicationId: "med-1", operation: "delete" });

    const pending = await repo.listPending(new Date().toISOString());
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe("delete");
  });

  it("listPending excludes entries currently syncing", async () => {
    await repo.enqueue({ userMedicationId: "med-1", operation: "delete" });
    await repo.markSyncing("med-1");
    expect(await repo.listPending(new Date().toISOString())).toHaveLength(0);
  });

  it("markFailed records the error, bumps attempts, and reschedules for later", async () => {
    await repo.enqueue({ userMedicationId: "med-1", operation: "delete" });
    const later = new Date(Date.now() + 10_000).toISOString();
    await repo.markFailed("med-1", "network error", later);

    expect(await repo.listPending(new Date().toISOString())).toHaveLength(0);
    const dueLater = await repo.listPending(later);
    expect(dueLater).toHaveLength(1);
    expect(dueLater[0].attempts).toBe(1);
  });

  it("clearIfUnchanged removes the entry when enqueuedAt still matches", async () => {
    await repo.enqueue({ userMedicationId: "med-1", operation: "delete" });
    const entry = await repo.get("med-1");
    const cleared = await repo.clearIfUnchanged("med-1", entry!.enqueuedAt);
    expect(cleared).toBe(true);
    expect(await repo.get("med-1")).toBeNull();
  });

  it("clearIfUnchanged does NOT remove the entry when it was superseded mid-flight (stale enqueuedAt)", async () => {
    await repo.enqueue({ userMedicationId: "med-1", operation: "upload", blob: blob(), contentType: "image/jpeg" });
    const staleEntry = await repo.get("med-1");

    // Simulates: a new photo was picked while the first upload was in flight.
    await repo.enqueue({ userMedicationId: "med-1", operation: "upload", blob: blob(), contentType: "image/png" });

    const cleared = await repo.clearIfUnchanged("med-1", staleEntry!.enqueuedAt);
    expect(cleared).toBe(false);
    expect(await repo.get("med-1")).not.toBeNull(); // the newer entry survives
  });

  it("enqueueing an upload without a blob throws — a caller-side contract violation, not a silently broken entry", async () => {
    await expect(repo.enqueue({ userMedicationId: "med-1", operation: "upload" })).rejects.toThrow();
  });
});
