import type { CatalogProduct } from "@/lib/domain/catalog";
import type { CatalogCacheRepository } from "@/lib/domain/repositories";
import { getClientDb, type LocalCatalogProductCache, type MedTrackingDexie } from "@/lib/db-client/dexie";

function stripCacheMetadata(cached: LocalCatalogProductCache): CatalogProduct {
  const product: Partial<LocalCatalogProductCache> = { ...cached };
  delete product.cachedAt;
  return product as CatalogProduct;
}

/**
 * Client-side cache of catalog products the user has actually seen
 * (Phase 1 §7's "local cache first" rule — matches the pattern the scan
 * flow will use in Phase 7-8, even though scanning itself isn't built
 * yet). Read-only from the application's point of view: never mutated by
 * the user, never goes through the outbox — `medication_catalog_product`
 * is server-authoritative reference data (Phase 2 §2.4).
 */
export class DexieCatalogCacheRepository implements CatalogCacheRepository {
  constructor(private readonly db: MedTrackingDexie = getClientDb()) {}

  async get(id: string): Promise<CatalogProduct | null> {
    const record = await this.db.catalogProductCache.get(id);
    if (!record) return null;
    return stripCacheMetadata(record);
  }

  async cacheAll(products: readonly CatalogProduct[]): Promise<void> {
    if (products.length === 0) return;
    const cachedAt = new Date().toISOString();
    await this.db.catalogProductCache.bulkPut(products.map((product) => ({ ...product, cachedAt })));
  }
}
