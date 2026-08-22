import { describe, expect, it, vi } from "vitest";
import { lookupGtin } from "@/lib/catalog/client/lookup-gtin";
import type { CatalogCacheRepository } from "@/lib/domain/repositories";
import type { CatalogProduct } from "@/lib/domain/catalog";
import { SEED_PLACEHOLDER_SOURCE } from "@/lib/domain/catalog";

function makeProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "product-1",
    gtin: "05012345678900",
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

function makeCache(overrides: Partial<CatalogCacheRepository> = {}): CatalogCacheRepository {
  return {
    get: vi.fn().mockResolvedValue(null),
    getByGtin: vi.fn().mockResolvedValue(null),
    cacheAll: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("lookupGtin — local-cache-first, server if online and uncached (Phase 1 §7)", () => {
  it("returns a cache hit without ever calling fetch", async () => {
    const product = makeProduct();
    const cache = makeCache({ getByGtin: vi.fn().mockResolvedValue(product) });
    const fetchImpl = vi.fn();

    const outcome = await lookupGtin(product.gtin!, "online", { cache, fetchImpl });

    expect(outcome).toEqual({ status: "found", product });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("online + cache miss: calls the server, caches the result, and returns it as found", async () => {
    const product = makeProduct();
    const cache = makeCache();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ product, gtin: product.gtin }),
    });

    const outcome = await lookupGtin(product.gtin!, "online", { cache, fetchImpl });

    expect(outcome).toEqual({ status: "found", product });
    expect(cache.cacheAll).toHaveBeenCalledWith([product]);
  });

  it("online + cache miss + server confirms no match: returns not-found, never invents a candidate", async () => {
    const cache = makeCache();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ product: null, gtin: "05012345678900" }),
    });

    const outcome = await lookupGtin("05012345678900", "online", { cache, fetchImpl });

    expect(outcome).toEqual({ status: "not-found" });
    expect(cache.cacheAll).not.toHaveBeenCalled();
  });

  it("offline + cache miss: returns unresolved-offline without touching the network", async () => {
    const cache = makeCache();
    const fetchImpl = vi.fn();

    const outcome = await lookupGtin("05012345678900", "offline", { cache, fetchImpl });

    expect(outcome).toEqual({ status: "unresolved-offline" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("backend-unreachable + cache miss: also returns unresolved-offline (device online, backend not — still can't confirm)", async () => {
    const cache = makeCache();
    const outcome = await lookupGtin("05012345678900", "backend-unreachable", { cache, fetchImpl: vi.fn() });
    expect(outcome).toEqual({ status: "unresolved-offline" });
  });

  it("online but the request itself fails (e.g. a flaky connection): treated as unresolved-offline, not a hard error", async () => {
    const cache = makeCache();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

    const outcome = await lookupGtin("05012345678900", "online", { cache, fetchImpl });

    expect(outcome).toEqual({ status: "unresolved-offline" });
  });
});
