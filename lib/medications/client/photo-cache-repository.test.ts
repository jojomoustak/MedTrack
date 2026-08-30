import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexiePhotoCacheRepository } from "@/lib/medications/client/photo-cache-repository";

function blobOfSize(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}

describe("DexiePhotoCacheRepository", () => {
  let db: MedTrackingDexie;
  let repo: DexiePhotoCacheRepository;

  beforeEach(() => {
    db = new MedTrackingDexie(`test-photo-cache-${crypto.randomUUID()}`);
    repo = new DexiePhotoCacheRepository(db);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("put + get round-trips a cached blob", async () => {
    const blob = blobOfSize(100);
    await repo.put({ userMedicationId: "med-1", blob, contentType: "image/jpeg" });

    const found = await repo.get("med-1");
    expect(found).not.toBeNull();
    expect(found?.contentType).toBe("image/jpeg");
    expect(found?.blob.size).toBe(100);
  });

  it("get returns null for a medication with nothing cached", async () => {
    expect(await repo.get("nonexistent")).toBeNull();
  });

  it("remove deletes the cached entry", async () => {
    await repo.put({ userMedicationId: "med-1", blob: blobOfSize(10), contentType: "image/jpeg" });
    await repo.remove("med-1");
    expect(await repo.get("med-1")).toBeNull();
  });

  it("put replaces any existing entry for the same medication (one photo per medication)", async () => {
    await repo.put({ userMedicationId: "med-1", blob: blobOfSize(10), contentType: "image/jpeg" });
    await repo.put({ userMedicationId: "med-1", blob: blobOfSize(20), contentType: "image/png" });

    const found = await repo.get("med-1");
    expect(found?.blob.size).toBe(20);
    expect(found?.contentType).toBe("image/png");
  });

  it("evicts the least-recently-viewed entry once the count cap is exceeded", async () => {
    for (let i = 0; i < 31; i++) {
      await repo.put({ userMedicationId: `med-${i}`, blob: blobOfSize(10), contentType: "image/jpeg" });
    }
    // The first-written (and never re-touched) entry should be the one evicted.
    expect(await repo.get("med-0")).toBeNull();
    expect(await repo.get("med-30")).not.toBeNull();
  });

  it("touch protects an entry from LRU eviction by refreshing its lastViewedAt", async () => {
    // Fill to exactly the count cap (30) — no eviction yet.
    for (let i = 0; i < 30; i++) {
      await repo.put({ userMedicationId: `med-${i}`, blob: blobOfSize(10), contentType: "image/jpeg" });
    }
    // med-0 is currently the oldest by lastViewedAt; touching it makes it the newest instead.
    await repo.touch("med-0");

    // One more entry pushes the table over the cap, forcing exactly one eviction.
    await repo.put({ userMedicationId: "med-30", blob: blobOfSize(10), contentType: "image/jpeg" });

    expect(await repo.get("med-0")).not.toBeNull(); // protected by the touch
    expect(await repo.get("med-1")).toBeNull(); // now the oldest untouched entry — evicted instead
  });

  it("evicts oldest entries once the byte budget (40MB) is exceeded", async () => {
    const big = 15 * 1024 * 1024; // 15MB
    await repo.put({ userMedicationId: "med-a", blob: blobOfSize(big), contentType: "image/jpeg" });
    await repo.put({ userMedicationId: "med-b", blob: blobOfSize(big), contentType: "image/jpeg" });
    await repo.put({ userMedicationId: "med-c", blob: blobOfSize(big), contentType: "image/jpeg" }); // 45MB total, over budget

    expect(await repo.get("med-a")).toBeNull(); // oldest evicted first
    expect(await repo.get("med-b")).not.toBeNull();
    expect(await repo.get("med-c")).not.toBeNull();
  });
});
