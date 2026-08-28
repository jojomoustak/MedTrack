import { describe, expect, it } from "vitest";
import { buildOfflineIndexEntries, offlineIndexEntryToCatalogProduct, type OfflineIndexEntry } from "@/lib/domain/offline-index";
import type { CatalogProduct } from "@/lib/domain/catalog";
import { EOF_DEV_IMPORT_SOURCE, SEED_PLACEHOLDER_SOURCE } from "@/lib/domain/catalog";

function makeProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "product-1",
    gtin: null,
    eofCode: "023280202",
    name: "DEPON EF.TAB 500MG/TAB ΒΤ x 10",
    nameNormalized: "depon ef.tab 500mg/tab vt x 10",
    manufacturer: "UPSA SAS, FRANCE",
    activeIngredient: "PARACETAMOL",
    strengthValue: null,
    strengthUnit: null,
    form: null,
    packSizeValue: null,
    packSizeUnit: null,
    regulatorySource: EOF_DEV_IMPORT_SOURCE,
    sourceVersion: "test",
    sourceLastUpdated: new Date().toISOString(),
    lifecycleState: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildOfflineIndexEntries", () => {
  it("maps a real EOF-sourced product into a compact entry, deriving the barcode from its EOF code", () => {
    const product = makeProduct();
    const [entry] = buildOfflineIndexEntries([product]);

    expect(entry).toEqual({
      id: "product-1",
      eofCode: "023280202",
      gtin: null,
      gtins: [],
      barcode: "2800232802025",
      name: "DEPON EF.TAB 500MG/TAB ΒΤ x 10",
      activeIngredient: "PARACETAMOL",
      strengthValue: null,
      strengthUnit: null,
      form: null,
      packSizeValue: null,
      packSizeUnit: null,
    });
  });

  it("excludes seed-placeholder rows — never presents fabricated demo data as part of the authoritative offline catalog", () => {
    const real = makeProduct({ id: "real-1" });
    const placeholder = makeProduct({ id: "placeholder-1", regulatorySource: SEED_PLACEHOLDER_SOURCE, eofCode: null, gtin: "05201234500017" });

    const entries = buildOfflineIndexEntries([real, placeholder]);

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("real-1");
  });

  it("a product with no eofCode gets a null derived barcode, never a fabricated one", () => {
    const product = makeProduct({ eofCode: null, gtin: "05201234500017" });
    const [entry] = buildOfflineIndexEntries([product]);
    expect(entry.barcode).toBeNull();
    expect(entry.gtin).toBe("05201234500017");
  });

  it("sorts entries by id for deterministic, stable serialization", () => {
    const b = makeProduct({ id: "b" });
    const a = makeProduct({ id: "a" });
    const c = makeProduct({ id: "c" });

    const entries = buildOfflineIndexEntries([b, a, c]);
    expect(entries.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("empty input produces an empty index, not an error", () => {
    expect(buildOfflineIndexEntries([])).toEqual([]);
  });

  it("a product with multiple mapped GTINs (spec §5): all of them appear in `gtins`, sorted", () => {
    const product = makeProduct({ id: "multi-gtin-product" });
    const gtinsByProductId = new Map([["multi-gtin-product", ["09999999999992", "09999999999991"]]]);

    const [entry] = buildOfflineIndexEntries([product], gtinsByProductId);

    expect(entry.gtins).toEqual(["09999999999991", "09999999999992"]); // sorted, not insertion order
  });

  it("a product with no GTIN mapping yet gets an empty `gtins` array — the honest, expected state, not an error", () => {
    const product = makeProduct();
    const [entry] = buildOfflineIndexEntries([product], new Map());
    expect(entry.gtins).toEqual([]);
  });
});

describe("offlineIndexEntryToCatalogProduct", () => {
  it("adapts an offline entry into a CatalogProduct-shaped object for CandidateConfirmation, honestly nulling fields not carried offline", () => {
    const entry: OfflineIndexEntry = {
      id: "product-1",
      eofCode: "076130401",
      gtin: null,
      gtins: [],
      barcode: "2800761304014",
      name: "FLAGYL CAPS 500MG/CAP BTX30",
      activeIngredient: "METRONIDAZOLE",
      strengthValue: null,
      strengthUnit: null,
      form: null,
      packSizeValue: null,
      packSizeUnit: null,
    };

    const product = offlineIndexEntryToCatalogProduct(entry);

    expect(product.id).toBe("product-1");
    expect(product.eofCode).toBe("076130401");
    expect(product.name).toBe("FLAGYL CAPS 500MG/CAP BTX30");
    expect(product.activeIngredient).toBe("METRONIDAZOLE");
    // Never carried by the compact offline index (spec §12) — honestly null, never fabricated.
    expect(product.manufacturer).toBeNull();
    // Real EOF-sourced data, resolved offline — never shown as placeholder test data.
    expect(product.regulatorySource).toBe(EOF_DEV_IMPORT_SOURCE);
  });
});
