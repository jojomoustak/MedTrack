import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import type { CatalogProduct } from "@/lib/domain/catalog";
import { SEED_PLACEHOLDER_SOURCE } from "@/lib/domain/catalog";

function makeProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: crypto.randomUUID(),
    gtin: null,
    name: "Παρακεταμόλη 500mg",
    nameNormalized: "παρακεταμολη 500mg",
    manufacturer: "Placeholder Pharma",
    activeIngredient: "Παρακεταμόλη",
    strengthValue: "500",
    strengthUnit: "mg",
    form: "tablet",
    packSizeValue: "20",
    packSizeUnit: "tablet",
    regulatorySource: SEED_PLACEHOLDER_SOURCE,
    sourceVersion: "phase6-seed-v1",
    sourceLastUpdated: new Date().toISOString(),
    lifecycleState: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("DexieCatalogCacheRepository (Phase 1 §7 local-cache-first)", () => {
  let db: MedTrackingDexie;
  let repo: DexieCatalogCacheRepository;

  beforeEach(() => {
    db = new MedTrackingDexie(`test-catalog-cache-${crypto.randomUUID()}`);
    repo = new DexieCatalogCacheRepository(db);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("get() returns null for a product never cached", async () => {
    expect(await repo.get(crypto.randomUUID())).toBeNull();
  });

  it("cacheAll() stores products so a subsequent get() finds them, with cache metadata stripped from the returned shape", async () => {
    const product = makeProduct();
    await repo.cacheAll([product]);

    const cached = await repo.get(product.id);
    expect(cached).toEqual(product);
    expect(cached).not.toHaveProperty("cachedAt");
  });

  it("cacheAll() is idempotent — caching the same product twice doesn't duplicate it", async () => {
    const product = makeProduct();
    await repo.cacheAll([product]);
    await repo.cacheAll([{ ...product, name: "Updated name" }]);

    const cached = await repo.get(product.id);
    expect(cached?.name).toBe("Updated name");
    expect(await db.catalogProductCache.count()).toBe(1);
  });

  it("cacheAll() with an empty array is a no-op", async () => {
    await repo.cacheAll([]);
    expect(await db.catalogProductCache.count()).toBe(0);
  });
});
