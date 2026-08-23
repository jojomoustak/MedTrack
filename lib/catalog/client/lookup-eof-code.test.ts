import { describe, expect, it, vi } from "vitest";
import { lookupEofCode } from "@/lib/catalog/client/lookup-eof-code";
import type { CatalogCacheRepository } from "@/lib/domain/repositories";
import type { CatalogProduct } from "@/lib/domain/catalog";
import { SEED_PLACEHOLDER_SOURCE } from "@/lib/domain/catalog";

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

function makeCache(overrides: Partial<CatalogCacheRepository> = {}): CatalogCacheRepository {
  return {
    get: vi.fn().mockResolvedValue(null),
    getByGtin: vi.fn().mockResolvedValue(null),
    getByEofCode: vi.fn().mockResolvedValue(null),
    cacheAll: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("lookupEofCode — Path A's local-cache-first, server if online and uncached", () => {
  it("returns a cache hit without ever calling fetch", async () => {
    const product = makeProduct();
    const cache = makeCache({ getByEofCode: vi.fn().mockResolvedValue(product) });
    const fetchImpl = vi.fn();

    const outcome = await lookupEofCode(product.eofCode!, "online", { cache, fetchImpl });

    expect(outcome).toEqual({ status: "found", product });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("online + cache miss: calls the server, caches the result, and returns it as found", async () => {
    const product = makeProduct();
    const cache = makeCache();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ product, gtin: null, eofCode: product.eofCode }),
    });

    const outcome = await lookupEofCode(product.eofCode!, "online", { cache, fetchImpl });

    expect(outcome).toEqual({ status: "found", product });
    expect(cache.cacheAll).toHaveBeenCalledWith([product]);
  });

  it("online + cache miss + server confirms no match: not-found, never invents a candidate", async () => {
    const cache = makeCache();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ product: null, gtin: null, eofCode: "023280202" }),
    });

    const outcome = await lookupEofCode("023280202", "online", { cache, fetchImpl });

    expect(outcome).toEqual({ status: "not-found" });
    expect(cache.cacheAll).not.toHaveBeenCalled();
  });

  it("offline + cache miss: returns unresolved-offline without touching the network", async () => {
    const cache = makeCache();
    const fetchImpl = vi.fn();

    const outcome = await lookupEofCode("023280202", "offline", { cache, fetchImpl });

    expect(outcome).toEqual({ status: "unresolved-offline" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("online but the request itself fails: treated as unresolved-offline, not a hard error", async () => {
    const cache = makeCache();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

    const outcome = await lookupEofCode("023280202", "online", { cache, fetchImpl });

    expect(outcome).toEqual({ status: "unresolved-offline" });
  });
});
