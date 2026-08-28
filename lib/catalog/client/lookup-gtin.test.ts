import { describe, expect, it, vi } from "vitest";
import { lookupGtin } from "@/lib/catalog/client/lookup-gtin";
import type { CatalogCacheRepository, LearnedMappingRepository, OfflineIndexRepository } from "@/lib/domain/repositories";
import type { CatalogProduct } from "@/lib/domain/catalog";
import { SEED_PLACEHOLDER_SOURCE } from "@/lib/domain/catalog";
import type { OfflineIndexEntry } from "@/lib/domain/offline-index";

function makeProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "product-1",
    gtin: "05012345678900",
    eofCode: null,
    name: "Παρακεταμόλη 500mg",
    nameNormalized: "παρακεταμολη 500mg",
    manufacturer: null,
    activeIngredient: "Παρακεταμόλη",
    strengthValue: "500",
    strengthUnit: "mg",
    form: "tablet",
    packSizeValue: "20",
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
    eofCode: null,
    gtin: "05012345678900",
    gtins: ["05012345678900"],
    barcode: null,
    name: "Παρακεταμόλη 500mg",
    activeIngredient: "Παρακεταμόλη",
    strengthValue: "500",
    strengthUnit: "mg",
    form: "tablet",
    packSizeValue: "20",
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

function makeLearnedMappings(overrides: Partial<LearnedMappingRepository> = {}): LearnedMappingRepository {
  return {
    getByGtin: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue({ overwroteDifferentProduct: false }),
    listUnsynced: vi.fn().mockResolvedValue([]),
    markSynced: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("lookupGtin — offline-index-first, then cache, then server if online (spec §17/§22, Phase 1 §7)", () => {
  it("returns an offline-index hit without ever reading the cache or calling fetch", async () => {
    const entry = makeOfflineEntry();
    const offlineIndex = makeOfflineIndex({ getByGtin: vi.fn().mockResolvedValue(entry) });
    const cache = makeCache();
    const fetchImpl = vi.fn();

    const outcome = await lookupGtin(entry.gtin!, "online", { cache, offlineIndex, fetchImpl });

    expect(outcome.status).toBe("found");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(cache.getByGtin).not.toHaveBeenCalled();
  });

  it("an offline-index hit is still written into catalogProductCache — a UserMedication created from it must resolve its display name later (real bug fixed 2026-08-28)", async () => {
    const entry = makeOfflineEntry({ name: "FLAGYL CAPS 500MG/CAP" });
    const offlineIndex = makeOfflineIndex({ getByGtin: vi.fn().mockResolvedValue(entry) });
    const cache = makeCache();

    await lookupGtin(entry.gtin!, "online", { cache, offlineIndex, fetchImpl: vi.fn() });

    expect(cache.cacheAll).toHaveBeenCalledTimes(1);
    const [cached] = (cache.cacheAll as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(cached.id).toBe(entry.id);
    expect(cached.name).toBe("FLAGYL CAPS 500MG/CAP");
  });

  it("offline-index miss, cache hit: returns the cache hit without ever calling fetch", async () => {
    const product = makeProduct();
    const cache = makeCache({ getByGtin: vi.fn().mockResolvedValue(product) });
    const offlineIndex = makeOfflineIndex();
    const fetchImpl = vi.fn();

    const outcome = await lookupGtin(product.gtin!, "online", { cache, offlineIndex, fetchImpl });

    expect(outcome).toEqual({ status: "found", product });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("online + both local sources miss: calls the server's real identifier resolution, caches the result, and returns it as found", async () => {
    const product = makeProduct();
    const cache = makeCache();
    const offlineIndex = makeOfflineIndex();
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      expect(url).toContain("/api/catalog/resolve-identifier");
      expect(url).toContain("type=GTIN");
      return Promise.resolve({ ok: true, json: async () => ({ state: "EXACT", product }) });
    });

    const outcome = await lookupGtin(product.gtin!, "online", { cache, offlineIndex, fetchImpl });

    expect(outcome).toEqual({ status: "found", product });
    expect(cache.cacheAll).toHaveBeenCalledWith([product]);
  });

  it("online + all sources miss + server confirms VALID_IDENTIFIER_UNRESOLVED: returns not-found, never invents a candidate", async () => {
    const cache = makeCache();
    const offlineIndex = makeOfflineIndex();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ state: "VALID_IDENTIFIER_UNRESOLVED" }),
    });

    const outcome = await lookupGtin("05012345678900", "online", { cache, offlineIndex, fetchImpl });

    expect(outcome).toEqual({ status: "not-found" });
    expect(cache.cacheAll).not.toHaveBeenCalled();
  });

  it("online + server finds a CONFLICT (two different products claim this GTIN): returns conflict, never silently picks one (spec §19)", async () => {
    const cache = makeCache();
    const offlineIndex = makeOfflineIndex();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ state: "CONFLICT", catalogProductIds: ["product-a", "product-b"] }),
    });

    const outcome = await lookupGtin("05012345678900", "online", { cache, offlineIndex, fetchImpl });

    expect(outcome).toEqual({ status: "conflict" });
    expect(cache.cacheAll).not.toHaveBeenCalled();
  });

  it("offline + all local sources miss: returns unresolved-offline without touching the network", async () => {
    const cache = makeCache();
    const offlineIndex = makeOfflineIndex();
    const learnedMappings = makeLearnedMappings();
    const fetchImpl = vi.fn();

    const outcome = await lookupGtin("05012345678900", "offline", { cache, offlineIndex, learnedMappings, fetchImpl });

    expect(outcome).toEqual({ status: "unresolved-offline" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("offline but the offline index HAS this product (synced index, never scanned on this device before): resolves anyway — this is the whole point of spec §22", async () => {
    const entry = makeOfflineEntry({ name: "FLAGYL CAPS 500MG/CAP", eofCode: null, gtin: "00000000000001" });
    const offlineIndex = makeOfflineIndex({ getByGtin: vi.fn().mockResolvedValue(entry) });
    const cache = makeCache();
    const fetchImpl = vi.fn();

    const outcome = await lookupGtin("00000000000001", "offline", { cache, offlineIndex, fetchImpl });

    expect(outcome.status).toBe("found");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("backend-unreachable + all local sources miss: also returns unresolved-offline (device online, backend not — still can't confirm)", async () => {
    const cache = makeCache();
    const offlineIndex = makeOfflineIndex();
    const learnedMappings = makeLearnedMappings();
    const outcome = await lookupGtin("05012345678900", "backend-unreachable", { cache, offlineIndex, learnedMappings, fetchImpl: vi.fn() });
    expect(outcome).toEqual({ status: "unresolved-offline" });
  });

  it("online but the request itself fails (e.g. a flaky connection): treated as unresolved-offline, not a hard error", async () => {
    const cache = makeCache();
    const offlineIndex = makeOfflineIndex();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

    const outcome = await lookupGtin("05012345678900", "online", { cache, offlineIndex, fetchImpl });

    expect(outcome).toEqual({ status: "unresolved-offline" });
  });
});

describe("lookupGtin — offline, previously OCR-confirmed GTIN (OCR-fallback task spec §15/§25)", () => {
  it("offline + offline-index/cache both miss + a local learned mapping exists: resolves via the learned mapping, no network needed", async () => {
    const entry = makeOfflineEntry({ id: "flagyl-product", name: "FLAGYL CAPS 500MG/CAP" });
    const cache = makeCache();
    const offlineIndex = makeOfflineIndex({ getById: vi.fn().mockResolvedValue(entry) });
    const learnedMappings = makeLearnedMappings({
      getByGtin: vi.fn().mockResolvedValue({ gtin: "05201048000563", catalogProductId: entry.id, evidenceType: "USER_CONFIRMED", confirmedAt: "t", syncedAt: null }),
    });
    const fetchImpl = vi.fn();

    const outcome = await lookupGtin("05201048000563", "offline", { cache, offlineIndex, learnedMappings, fetchImpl });

    expect(outcome.status).toBe("found");
    if (outcome.status === "found") expect(outcome.product.id).toBe("flagyl-product");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("offline + no learned mapping either: still returns unresolved-offline, never fabricates a match", async () => {
    const cache = makeCache();
    const offlineIndex = makeOfflineIndex();
    const learnedMappings = makeLearnedMappings();

    const outcome = await lookupGtin("05201048000563", "offline", { cache, offlineIndex, learnedMappings, fetchImpl: vi.fn() });

    expect(outcome).toEqual({ status: "unresolved-offline" });
  });

  it("online: does NOT consult the local learned mapping at all — the server's own resolve-identifier already implements full precedence (spec §20)", async () => {
    const product = makeProduct();
    const cache = makeCache();
    const offlineIndex = makeOfflineIndex();
    const learnedMappings = makeLearnedMappings();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ state: "EXACT", product, evidence: "AUTHORITATIVE" }) });

    await lookupGtin(product.gtin!, "online", { cache, offlineIndex, learnedMappings, fetchImpl });

    expect(learnedMappings.getByGtin).not.toHaveBeenCalled();
  });
});
