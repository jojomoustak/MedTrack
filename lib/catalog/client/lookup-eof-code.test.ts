import { describe, expect, it, vi } from "vitest";
import { lookupEofCode } from "@/lib/catalog/client/lookup-eof-code";
import type { CatalogCacheRepository, OfflineIndexRepository } from "@/lib/domain/repositories";
import type { CatalogProduct } from "@/lib/domain/catalog";
import { SEED_PLACEHOLDER_SOURCE } from "@/lib/domain/catalog";
import type { OfflineIndexEntry } from "@/lib/domain/offline-index";

function makeProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "product-1",
    gtin: null,
    eofCode: "023280202",
    name: "DEPON αναβράζον 500mg",
    nameNormalized: "depon αναβραζον 500mg",
    manufacturer: null,
    activeIngredient: "Παρακεταμόλη",
    strengthValue: "500",
    strengthUnit: "mg",
    form: "tablet",
    packSizeValue: "10",
    packSizeUnit: "tablet",
    regulatorySource: SEED_PLACEHOLDER_SOURCE,
    sourceVersion: "test",
    sourceLastUpdated: new Date().toISOString(),
    lifecycleState: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeOfflineEntry(overrides: Partial<OfflineIndexEntry> = {}): OfflineIndexEntry {
  return {
    id: "product-1",
    eofCode: "023280202",
    gtin: null,
    gtins: [],
    barcode: "2800232802025",
    name: "DEPON αναβράζον 500mg",
    activeIngredient: "Παρακεταμόλη",
    strengthValue: "500",
    strengthUnit: "mg",
    form: "tablet",
    packSizeValue: "10",
    packSizeUnit: "tablet",
    ...overrides,
  };
}

function makeCache(overrides: Partial<CatalogCacheRepository> = {}): CatalogCacheRepository {
  return {
    get: vi.fn().mockResolvedValue(null),
    getByGtin: vi.fn().mockResolvedValue(null),
    getByEofCode: vi.fn().mockResolvedValue(null),
    cacheAll: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeOfflineIndex(overrides: Partial<OfflineIndexRepository> = {}): OfflineIndexRepository {
  return {
    getManifest: vi.fn().mockResolvedValue(null),
    getById: vi.fn().mockResolvedValue(null),
    getAll: vi.fn().mockResolvedValue([]),
    getByEofCode: vi.fn().mockResolvedValue(null),
    getByGtin: vi.fn().mockResolvedValue(null),
    search: vi.fn().mockResolvedValue([]),
    replaceAll: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("lookupEofCode — Path A's offline-index-first, then cache, then server if online (spec §17/§22)", () => {
  it("returns an offline-index hit without ever reading the cache or calling fetch", async () => {
    const entry = makeOfflineEntry();
    const offlineIndex = makeOfflineIndex({ getByEofCode: vi.fn().mockResolvedValue(entry) });
    const cache = makeCache();
    const fetchImpl = vi.fn();

    const outcome = await lookupEofCode(entry.eofCode!, "online", { cache, offlineIndex, fetchImpl });

    expect(outcome.status).toBe("found");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(cache.getByEofCode).not.toHaveBeenCalled();
  });

  it("an offline-index hit is still written into catalogProductCache — a UserMedication created from it must resolve its display name later (real bug fixed 2026-08-28)", async () => {
    const entry = makeOfflineEntry();
    const offlineIndex = makeOfflineIndex({ getByEofCode: vi.fn().mockResolvedValue(entry) });
    const cache = makeCache();

    await lookupEofCode(entry.eofCode!, "online", { cache, offlineIndex, fetchImpl: vi.fn() });

    expect(cache.cacheAll).toHaveBeenCalledTimes(1);
    const [cached] = (cache.cacheAll as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(cached.id).toBe(entry.id);
    expect(cached.name).toBe(entry.name);
  });

  it("offline, but the offline index has this product (synced index, never scanned on this device before) — this is spec §22's actual point", async () => {
    const entry = makeOfflineEntry({ eofCode: "076130401", name: "FLAGYL CAPS 500MG/CAP" });
    const offlineIndex = makeOfflineIndex({ getByEofCode: vi.fn().mockResolvedValue(entry) });
    const cache = makeCache();
    const fetchImpl = vi.fn();

    const outcome = await lookupEofCode("076130401", "offline", { cache, offlineIndex, fetchImpl });

    expect(outcome.status).toBe("found");
    if (outcome.status === "found") expect(outcome.product.name).toBe("FLAGYL CAPS 500MG/CAP");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("offline-index miss, cache hit: returns the cache hit without ever calling fetch", async () => {
    const product = makeProduct();
    const cache = makeCache({ getByEofCode: vi.fn().mockResolvedValue(product) });
    const offlineIndex = makeOfflineIndex();
    const fetchImpl = vi.fn();

    const outcome = await lookupEofCode(product.eofCode!, "online", { cache, offlineIndex, fetchImpl });

    expect(outcome).toEqual({ status: "found", product });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("online + both local sources miss: calls the server, caches the result, and returns it as found", async () => {
    const product = makeProduct();
    const cache = makeCache();
    const offlineIndex = makeOfflineIndex();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ product, gtin: null, eofCode: product.eofCode }),
    });

    const outcome = await lookupEofCode(product.eofCode!, "online", { cache, offlineIndex, fetchImpl });

    expect(outcome).toEqual({ status: "found", product });
    expect(cache.cacheAll).toHaveBeenCalledWith([product]);
  });

  it("online + all sources miss + server confirms no match: not-found, never invents a candidate", async () => {
    const cache = makeCache();
    const offlineIndex = makeOfflineIndex();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ product: null, gtin: null, eofCode: "023280202" }),
    });

    const outcome = await lookupEofCode("023280202", "online", { cache, offlineIndex, fetchImpl });

    expect(outcome).toEqual({ status: "not-found" });
    expect(cache.cacheAll).not.toHaveBeenCalled();
  });

  it("offline + all local sources miss: returns unresolved-offline without touching the network", async () => {
    const cache = makeCache();
    const offlineIndex = makeOfflineIndex();
    const fetchImpl = vi.fn();

    const outcome = await lookupEofCode("023280202", "offline", { cache, offlineIndex, fetchImpl });

    expect(outcome).toEqual({ status: "unresolved-offline" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("online but the request itself fails: treated as unresolved-offline, not a hard error", async () => {
    const cache = makeCache();
    const offlineIndex = makeOfflineIndex();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

    const outcome = await lookupEofCode("023280202", "online", { cache, offlineIndex, fetchImpl });

    expect(outcome).toEqual({ status: "unresolved-offline" });
  });
});
