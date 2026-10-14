import type { CatalogProduct } from "@/lib/domain/catalog";
import type { CatalogCacheRepository, LearnedMappingRepository } from "@/lib/domain/repositories";
import { DexieLearnedMappingRepository } from "@/lib/db-client/learned-mapping-repository";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { confirmCatalogIdentifier } from "@/lib/catalog/client/api";
import { logger } from "@/lib/logging/logger";

/**
 * Remembers which catalog product a scanned package is, after the person
 * identified it themselves (reading the label, or finding it in the
 * catalog) — so the next scan of the same package finds it straight away.
 *
 * Keyed on the scan's 14-digit number (`ParsedBarcode.gtin`) whatever the
 * barcode type: a Greek national EAN-13 (`280…`) is learned under its full
 * number too, and `ScanStep` checks learned packages for both kinds. Found
 * by the owner (2026-10-15): ALGOFREN, scanned again, still wasn't
 * recognised — Greek national barcodes were never learned nor checked.
 *
 * Resolves for this profile only. Since 2026-10-15 the server also shares
 * it, anonymously, as a suggestion other people must confirm themselves
 * (`PostgresCatalogProvider.confirmIdentifier`); it never resolves for them
 * by itself. The device copy makes a repeat scan work offline; the server
 * copy (USER_CONFIRMED) is best-effort and retried by
 * `sync-learned-mappings.ts`. Never throws and never blocks the caller.
 */
export async function learnScannedBarcode(
  gtin: string,
  product: CatalogProduct,
  deps: { learnedMappings?: LearnedMappingRepository; cache?: Pick<CatalogCacheRepository, "cacheAll">; fetchImpl?: typeof fetch } = {},
): Promise<void> {
  const mappings = deps.learnedMappings ?? new DexieLearnedMappingRepository();
  const cache = deps.cache ?? new DexieCatalogCacheRepository();

  try {
    // The medication's name is resolved through this cache, by id.
    await cache.cacheAll([product]);
  } catch (err) {
    logger.warn("learn_scanned_barcode.cache_product_failed", { message: (err as Error).message });
  }

  try {
    const { overwroteDifferentProduct } = await mappings.save({
      gtin,
      catalogProductId: product.id,
      evidenceType: "USER_CONFIRMED",
      confirmedAt: new Date().toISOString(),
      syncedAt: null,
    });
    if (overwroteDifferentProduct) logger.warn("learn_scanned_barcode.overwrote_different_product");
  } catch (err) {
    // The server copy below still makes it known to this account.
    logger.warn("learn_scanned_barcode.save_failed", { message: (err as Error).message });
  }

  void confirmCatalogIdentifier("GTIN", gtin, product.id, deps.fetchImpl)
    .then(() => mappings.markSynced(gtin, new Date().toISOString()))
    .catch((err: Error) => logger.warn("learn_scanned_barcode.server_confirm_failed", { message: err.message }));
}
