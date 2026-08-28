import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieLearnedMappingRepository } from "@/lib/db-client/learned-mapping-repository";
import type { LearnedGtinMapping } from "@/lib/domain/learned-mapping";

function makeMapping(overrides: Partial<LearnedGtinMapping> = {}): LearnedGtinMapping {
  return {
    gtin: "05201048000563",
    catalogProductId: crypto.randomUUID(),
    evidenceType: "USER_CONFIRMED",
    confirmedAt: new Date().toISOString(),
    syncedAt: null,
    ...overrides,
  };
}

describe("DexieLearnedMappingRepository (OCR-fallback task spec §12-§16)", () => {
  let db: MedTrackingDexie;
  let repo: DexieLearnedMappingRepository;

  beforeEach(() => {
    db = new MedTrackingDexie(`test-learned-mapping-${crypto.randomUUID()}`);
    repo = new DexieLearnedMappingRepository(db);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("getByGtin returns null before anything has been confirmed", async () => {
    expect(await repo.getByGtin("05201048000563")).toBeNull();
  });

  it("save then getByGtin resolves the confirmed mapping — works with no network involved (spec §15)", async () => {
    const mapping = makeMapping();
    await repo.save(mapping);
    expect(await repo.getByGtin(mapping.gtin)).toEqual(mapping);
  });

  it("save reports overwroteDifferentProduct: false for a first confirmation", async () => {
    const result = await repo.save(makeMapping());
    expect(result.overwroteDifferentProduct).toBe(false);
  });

  it("re-confirming the SAME product for the SAME gtin is not reported as an overwrite", async () => {
    const mapping = makeMapping();
    await repo.save(mapping);
    const result = await repo.save({ ...mapping, confirmedAt: new Date().toISOString() });
    expect(result.overwroteDifferentProduct).toBe(false);
  });

  it("confirming a DIFFERENT product for a gtin already mapped locally is reported honestly, never silent", async () => {
    const first = makeMapping();
    await repo.save(first);
    const second = makeMapping({ gtin: first.gtin, catalogProductId: crypto.randomUUID() });
    const result = await repo.save(second);
    expect(result.overwroteDifferentProduct).toBe(true);
    // This device only remembers its most recent confirmation locally —
    // the server side (`confirmIdentifier`) is where both facts are
    // durably preserved as a real CONFLICT (spec §19).
    expect(await repo.getByGtin(first.gtin)).toEqual(second);
  });

  it("listUnsynced returns only rows with syncedAt === null", async () => {
    await repo.save(makeMapping({ gtin: "gtin-unsynced" }));
    await repo.save(makeMapping({ gtin: "gtin-synced", syncedAt: new Date().toISOString() }));

    const unsynced = await repo.listUnsynced();
    expect(unsynced).toHaveLength(1);
    expect(unsynced[0].gtin).toBe("gtin-unsynced");
  });

  it("markSynced sets syncedAt and removes the row from listUnsynced", async () => {
    const mapping = makeMapping({ gtin: "gtin-to-sync" });
    await repo.save(mapping);
    expect(await repo.listUnsynced()).toHaveLength(1);

    const syncedAt = new Date().toISOString();
    await repo.markSynced(mapping.gtin, syncedAt);

    expect(await repo.listUnsynced()).toEqual([]);
    expect((await repo.getByGtin(mapping.gtin))?.syncedAt).toBe(syncedAt);
  });
});
