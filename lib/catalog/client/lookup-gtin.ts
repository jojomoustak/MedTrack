import type { CatalogProduct } from "@/lib/domain/catalog";
import type { CatalogCacheRepository } from "@/lib/domain/repositories";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { lookupCatalogByGtin } from "@/lib/catalog/client/api";
import type { NetworkState } from "@/lib/sync/client/network";
import { logger } from "@/lib/logging/logger";

export type CatalogLookupOutcome =
  | { status: "found"; product: CatalogProduct }
  /** A real lookup ran (cache and/or server) and found nothing — distinct from `unresolved-offline`, which never got to ask the server at all. */
  | { status: "not-found" }
  /** Offline and not already cached — Phase 1 §7's "unresolved candidate is saved and resolved when connectivity returns" case. The caller is expected to persist this via `UnresolvedScanRepository` and let the user continue manually immediately rather than wait. */
  | { status: "unresolved-offline" };

/**
 * GTIN lookup for the scan flow: local cache first (offline-capable),
 * server only if online and uncached (Phase 1 §7). A successful server hit
 * is cached back locally so a repeat scan of the same package resolves
 * offline next time.
 */
export async function lookupGtin(
  gtin: string,
  network: NetworkState,
  deps: { cache?: CatalogCacheRepository; fetchImpl?: typeof fetch } = {},
): Promise<CatalogLookupOutcome> {
  const cache = deps.cache ?? new DexieCatalogCacheRepository();

  const cached = await cache.getByGtin(gtin);
  if (cached) return { status: "found", product: cached };

  if (network !== "online") {
    return { status: "unresolved-offline" };
  }

  try {
    const response = await lookupCatalogByGtin(gtin, deps.fetchImpl);
    if (!response.product) return { status: "not-found" };
    await cache.cacheAll([response.product]);
    return { status: "found", product: response.product };
  } catch (err) {
    // A network-level failure here (vs. a clean "not found" response) is
    // treated the same as offline — the device claimed to be online but
    // the request still didn't complete, so this scan genuinely wasn't
    // resolved yet rather than confirmed absent from the catalog.
    logger.warn("catalog.lookup.network_failed", { message: (err as Error).message });
    return { status: "unresolved-offline" };
  }
}
