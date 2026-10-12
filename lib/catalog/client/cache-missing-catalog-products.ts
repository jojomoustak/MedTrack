import type { CatalogCacheRepository, OfflineIndexRepository } from "@/lib/domain/repositories";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import { fetchCatalogProducts } from "@/lib/catalog/client/api";
import { notifyOfflineIndexUpdated } from "@/lib/catalog/client/offline-index-signal";
import { CATALOG_PRODUCTS_MAX_IDS } from "@/lib/validation/catalog";
import { logger } from "@/lib/logging/logger";

/** A restore must not wait on a hung request: reminders are re-armed right after this. */
const REQUEST_TIMEOUT_MS = 8_000;

/** Requests in flight, per catalog product id — a second caller for the same id waits for the first instead of asking again. */
const inFlight = new Map<string, Promise<void>>();

/** Whether a request for this product is under way — a screen waits for it rather than showing the placeholder name. */
export function isCatalogProductRequestPending(catalogProductId: string): boolean {
  return inFlight.has(catalogProductId);
}

export interface CacheMissingCatalogProductsDeps {
  cache?: Pick<CatalogCacheRepository, "get" | "cacheAll">;
  offlineIndex?: Pick<OfflineIndexRepository, "getById">;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Fetches, from the server, the catalog products this device knows nothing
 * about — not in `catalogProductCache`, not in the offline index — and
 * caches them, then tells every screen to resolve names again
 * (`notifyOfflineIndexUpdated`).
 *
 * Found by the owner (2026-10-12): after Android "Clear data", the cloud
 * restore brings the medications back in moments, but a catalog
 * medication stores only its `catalogProductId`; its name came only from
 * the full offline index, a multi-megabyte background download. Until it
 * finished, every name read "Φάρμακο από κατάλογο" — and reminders armed
 * in that window carried the placeholder as their title. This asks for just
 * the user's own few products in one small request.
 *
 * Returns how many products it newly cached. Never throws: offline, signed
 * out or a server error leave things as they were (the offline index still
 * fills in later), and the next restore, reconnect or app start tries again.
 */
export async function cacheMissingCatalogProducts(catalogProductIds: Iterable<string>, deps: CacheMissingCatalogProductsDeps = {}): Promise<number> {
  const cache = deps.cache ?? new DexieCatalogCacheRepository();
  const offlineIndex = deps.offlineIndex ?? new DexieOfflineIndexRepository();
  const waitFor: Promise<void>[] = [];
  let missing: string[] = [];

  try {
    for (const id of new Set(catalogProductIds)) {
      const pending = inFlight.get(id);
      if (pending) {
        waitFor.push(pending);
        continue;
      }
      if ((await cache.get(id)) || (await offlineIndex.getById(id))) continue;
      missing.push(id);
    }
  } catch (err) {
    logger.warn("catalog.products.local_read_failed", { message: err instanceof Error ? err.message : String(err) });
    return 0;
  }
  // Checked again after the reads above: another caller may have asked meanwhile.
  missing = missing.filter((id) => {
    const pending = inFlight.get(id);
    if (pending) waitFor.push(pending);
    return !pending;
  });

  let cached = 0;
  for (let i = 0; i < missing.length; i += CATALOG_PRODUCTS_MAX_IDS) {
    const batch = missing.slice(i, i + CATALOG_PRODUCTS_MAX_IDS);
    const request = fetchAndCache(batch, cache, deps.fetchImpl ?? fetch, deps.timeoutMs ?? REQUEST_TIMEOUT_MS)
      .then((count) => {
        cached += count;
      })
      .finally(() => {
        for (const id of batch) inFlight.delete(id);
      });
    for (const id of batch) inFlight.set(id, request);
    waitFor.push(request);
  }
  // Also waits for other callers' requests covering these ids, so a caller
  // that gets 0 back still knows the names are now as resolved as they'll get.
  await Promise.all(waitFor);
  return cached;
}

async function fetchAndCache(
  ids: string[],
  cache: Pick<CatalogCacheRepository, "cacheAll">,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const products = await fetchCatalogProducts(ids, fetchImpl, controller.signal);
    await cache.cacheAll(products);
    if (products.length > 0) notifyOfflineIndexUpdated();
    return products.length;
  } catch (err) {
    // A count only: which products a user takes is health data (CLAUDE.md rule 8).
    logger.warn("catalog.products.fetch_failed", { count: ids.length, message: err instanceof Error ? err.message : String(err) });
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

/** Test seam. */
export function __resetCatalogProductRequestsForTests(): void {
  inFlight.clear();
}
