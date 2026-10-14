import { describe, expect, it, vi } from "vitest";
import { learnScannedBarcode } from "@/lib/catalog/client/learn-scanned-barcode";
import type { CatalogProduct } from "@/lib/domain/catalog";
import type { LearnedMappingRepository } from "@/lib/domain/repositories";

// The full number of a Greek national EAN-13 ("280…"), as ParsedBarcode.gtin carries it.
const GREEK_PACKAGE = "02800232802025";
const product = { id: "11111111-1111-4111-8111-111111111111", name: "ALGOFREN F.C.TAB 600MG/TAB BTx20 (BLIST 2x10)" } as CatalogProduct;

function fakeLearnedMappings(overrides: Partial<LearnedMappingRepository> = {}): LearnedMappingRepository {
  return {
    getByGtin: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue({ overwroteDifferentProduct: false }),
    listUnsynced: vi.fn().mockResolvedValue([]),
    markSynced: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("learnScannedBarcode (2026-10-15)", () => {
  it("caches the product, remembers the package on the phone, and confirms it to the server for this account", async () => {
    const cache = { cacheAll: vi.fn().mockResolvedValue(undefined) };
    const learnedMappings = fakeLearnedMappings();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: "CREATED" }), { status: 200 }));

    await learnScannedBarcode(GREEK_PACKAGE, product, { cache, learnedMappings, fetchImpl });

    expect(cache.cacheAll).toHaveBeenCalledWith([product]);
    expect(learnedMappings.save).toHaveBeenCalledWith(
      expect.objectContaining({ gtin: GREEK_PACKAGE, catalogProductId: product.id, evidenceType: "USER_CONFIRMED", syncedAt: null }),
    );
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/catalog/confirm-identifier");
    expect(JSON.parse(String(init.body))).toEqual({ type: "GTIN", value: GREEK_PACKAGE, catalogProductId: product.id });
    await vi.waitFor(() => expect(learnedMappings.markSynced).toHaveBeenCalledWith(GREEK_PACKAGE, expect.any(String)));
  });

  it("never throws or blocks: a failing phone store still reaches the server, a failing server leaves it queued for later", async () => {
    const brokenStore = fakeLearnedMappings({ save: vi.fn().mockRejectedValue(new Error("IndexedDB unavailable")) });
    const serverUp = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(learnScannedBarcode(GREEK_PACKAGE, product, { cache: { cacheAll: vi.fn() }, learnedMappings: brokenStore, fetchImpl: serverUp })).resolves.toBeUndefined();
    expect(serverUp).toHaveBeenCalledTimes(1);

    const store = fakeLearnedMappings();
    const serverDown = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(learnScannedBarcode(GREEK_PACKAGE, product, { cache: { cacheAll: vi.fn() }, learnedMappings: store, fetchImpl: serverDown })).resolves.toBeUndefined();
    expect(store.save).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.markSynced).not.toHaveBeenCalled(); // stays unsynced: sync-learned-mappings retries it
  });
});
