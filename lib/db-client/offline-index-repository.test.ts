import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import type { OfflineIndexEntry } from "@/lib/domain/offline-index";
import type { OfflineIndexLocalManifest } from "@/lib/domain/repositories";

function makeEntry(overrides: Partial<OfflineIndexEntry> = {}): OfflineIndexEntry {
  return {
    id: crypto.randomUUID(),
    eofCode: "023280202",
    gtin: null,
    gtins: [],
    barcode: "2800232802025",
    name: "DEPON EF.TAB 500MG/TAB",
    activeIngredient: "PARACETAMOL",
    strengthValue: null,
    strengthUnit: null,
    form: null,
    packSizeValue: null,
    packSizeUnit: null,
    ...overrides,
  };
}

function makeManifest(overrides: Partial<OfflineIndexLocalManifest> = {}): OfflineIndexLocalManifest {
  return { version: "abc123", recordCount: 1, generatedAt: new Date().toISOString(), syncedAt: new Date().toISOString(), ...overrides };
}

describe("DexieOfflineIndexRepository (spec §12/§17/§18)", () => {
  let db: MedTrackingDexie;
  let repo: DexieOfflineIndexRepository;

  beforeEach(() => {
    db = new MedTrackingDexie(`test-offline-index-${crypto.randomUUID()}`);
    repo = new DexieOfflineIndexRepository(db);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("getManifest() returns null before any sync has ever happened", async () => {
    expect(await repo.getManifest()).toBeNull();
  });

  it("replaceAll() stores entries and the manifest together, atomically", async () => {
    const entry = makeEntry();
    const manifest = makeManifest();

    await repo.replaceAll(manifest, [entry]);

    expect(await repo.getManifest()).toEqual(manifest);
    expect(await repo.getByEofCode(entry.eofCode!)).toEqual(entry);
  });

  it("replaceAll() fully replaces the previous contents — an old entry not present in the new set is gone", async () => {
    const oldEntry = makeEntry({ eofCode: "111111111" });
    await repo.replaceAll(makeManifest({ version: "v1" }), [oldEntry]);
    expect(await repo.getByEofCode("111111111")).not.toBeNull();

    const newEntry = makeEntry({ eofCode: "222222222" });
    await repo.replaceAll(makeManifest({ version: "v2" }), [newEntry]);

    expect(await repo.getByEofCode("111111111")).toBeNull();
    expect(await repo.getByEofCode("222222222")).not.toBeNull();
  });

  it("getByEofCode() and getByGtin() are independent lookups, each returning null on a miss", async () => {
    const entry = makeEntry({ eofCode: "023280202", gtin: null });
    await repo.replaceAll(makeManifest(), [entry]);

    expect(await repo.getByEofCode("023280202")).toEqual(entry);
    expect(await repo.getByEofCode("999999999")).toBeNull();
    expect(await repo.getByGtin("05012345678900")).toBeNull();
  });

  it("search() finds a match by brand name, case/diacritic-insensitively via toLocaleLowerCase", async () => {
    const entry = makeEntry({ name: "FLAGYL CAPS 500MG/CAP BTX30" });
    await repo.replaceAll(makeManifest(), [entry]);

    expect(await repo.search("flagyl")).toEqual([entry]);
    expect(await repo.search("FLAGYL")).toEqual([entry]);
  });

  it("search() also matches by active ingredient", async () => {
    const entry = makeEntry({ name: "FLAGYL CAPS", activeIngredient: "METRONIDAZOLE" });
    await repo.replaceAll(makeManifest(), [entry]);

    expect(await repo.search("metronidazole")).toEqual([entry]);
  });

  it("search() with no matches returns an empty array, never guesses", async () => {
    await repo.replaceAll(makeManifest(), [makeEntry({ name: "DEPON" })]);
    expect(await repo.search("SPORTGEL")).toEqual([]);
  });

  it("search() respects the limit parameter", async () => {
    const entries = Array.from({ length: 5 }, (_, i) => makeEntry({ id: crypto.randomUUID(), eofCode: `00000000${i}`, name: `PARACETAMOL BRAND ${i}` }));
    await repo.replaceAll(makeManifest({ recordCount: 5 }), entries);

    const results = await repo.search("paracetamol", 3);
    expect(results).toHaveLength(3);
  });

  it("replaceAll() with an empty entries array clears everything and still records the manifest (a legitimate empty-catalog state)", async () => {
    await repo.replaceAll(makeManifest({ recordCount: 1 }), [makeEntry()]);
    const emptyManifest = makeManifest({ version: "v-empty", recordCount: 0 });
    await repo.replaceAll(emptyManifest, []);

    expect(await repo.getManifest()).toEqual(emptyManifest);
    expect(await repo.search("depon")).toEqual([]);
  });

  describe("getByGtin — multiEntry index over `gtins` (GTIN-resolution task spec §5/§19)", () => {
    it("finds a product by any one of its multiple mapped GTINs", async () => {
      const entry = makeEntry({ gtins: ["05012345678900", "05012345678917"] });
      await repo.replaceAll(makeManifest(), [entry]);

      expect(await repo.getByGtin("05012345678900")).toEqual(entry);
      expect(await repo.getByGtin("05012345678917")).toEqual(entry);
    });

    it("a GTIN not present in any product's `gtins` array: null, never a guess", async () => {
      const entry = makeEntry({ gtins: ["05012345678900"] });
      await repo.replaceAll(makeManifest(), [entry]);

      expect(await repo.getByGtin("00000000000000")).toBeNull();
    });

    it("CONFLICT: two different products both claim the same GTIN — returns null (never arbitrarily picks one), not a crash", async () => {
      const productA = makeEntry({ id: "product-a", gtins: ["09999999999999"] });
      const productB = makeEntry({ id: "product-b", gtins: ["09999999999999"] });
      await repo.replaceAll(makeManifest({ recordCount: 2 }), [productA, productB]);

      expect(await repo.getByGtin("09999999999999")).toBeNull();
    });

    it("a product with an empty `gtins` array (no mapping yet) is simply never matched by any GTIN lookup", async () => {
      const entry = makeEntry({ gtins: [] });
      await repo.replaceAll(makeManifest(), [entry]);

      expect(await repo.getByGtin("05012345678900")).toBeNull();
    });
  });
});
