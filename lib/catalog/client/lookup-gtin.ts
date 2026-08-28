import type { CatalogProduct } from "@/lib/domain/catalog";
import type { CatalogCacheRepository, OfflineIndexRepository } from "@/lib/domain/repositories";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import { offlineIndexEntryToCatalogProduct } from "@/lib/domain/offline-index";
import { resolveCatalogIdentifier } from "@/lib/catalog/client/api";
import type { NetworkState } from "@/lib/sync/client/network";
import { logger } from "@/lib/logging/logger";

export type CatalogLookupOutcome =
  | { status: "found"; product: CatalogProduct }
  /** A real lookup ran (cache and/or server) and found nothing — distinct from `unresolved-offline`, which never got to ask the server at all. */
  | { status: "not-found" }
  /**
   * The server found two or more DIFFERENT products both authoritatively
   * claiming this exact GTIN (GTIN-resolution task spec §19) — never
   * silently resolved to either one. Only ever produced by the online
   * server path (`PostgresCatalogProvider.lookupByIdentifier`); the
   * offline index degrades a conflict to `not-found` instead (see
   * `DexieOfflineIndexRepository.getByGtin`'s doc comment for why).
   */
  | { status: "conflict" }
  /** Offline and not already cached — Phase 1 §7's "unresolved candidate is saved and resolved when connectivity returns" case. The caller is expected to persist this via `UnresolvedScanRepository` and let the user continue manually immediately rather than wait. */
  | { status: "unresolved-offline" };

/**
 * GTIN lookup for the scan flow — the real GS1 DataMatrix resolution path
 * (GTIN-resolution task spec §3). Checks the full compact offline index
 * FIRST (spec §17/§22 — covers every synced product, not just ones this
 * device has personally looked up before), then the older per-product
 * cache (populated by past online lookups), then the server's real
 * multi-identifier resolution (`lookupByIdentifier`, spec §19) only if
 * online and still uncached. A successful server hit is cached back
 * locally so a repeat scan of the same package resolves offline next time
 * even before the next full index sync.
 *
 * Never derives a GTIN's product from the GTIN's digits (spec §3: "do not
 * attempt to derive EOF/NHRN from an arbitrary DataMatrix GTIN by slicing
 * digits or adding 280") — a GTIN and a Greek national EAN-13 are
 * structurally different identifier spaces (architecture doc §2.1/§2.5);
 * this function only ever does exact, authoritative-mapping lookups.
 */
export async function lookupGtin(
  gtin: string,
  network: NetworkState,
  deps: { cache?: CatalogCacheRepository; offlineIndex?: OfflineIndexRepository; fetchImpl?: typeof fetch } = {},
): Promise<CatalogLookupOutcome> {
  const offlineIndex = deps.offlineIndex ?? new DexieOfflineIndexRepository();
  const cache = deps.cache ?? new DexieCatalogCacheRepository();

  const indexed = await offlineIndex.getByGtin(gtin);
  if (indexed) return { status: "found", product: offlineIndexEntryToCatalogProduct(indexed) };

  const cached = await cache.getByGtin(gtin);
  if (cached) return { status: "found", product: cached };

  if (network !== "online") {
    return { status: "unresolved-offline" };
  }

  try {
    const resolution = await resolveCatalogIdentifier("GTIN", gtin, deps.fetchImpl);
    if (resolution.state === "VALID_IDENTIFIER_UNRESOLVED") return { status: "not-found" };
    if (resolution.state === "CONFLICT") return { status: "conflict" };
    await cache.cacheAll([resolution.product]);
    return { status: "found", product: resolution.product };
  } catch (err) {
    // A network-level failure here (vs. a clean resolution response) is
    // treated the same as offline — the device claimed to be online but
    // the request still didn't complete, so this scan genuinely wasn't
    // resolved yet rather than confirmed absent from the catalog.
    logger.warn("catalog.lookup.network_failed", { message: (err as Error).message });
    return { status: "unresolved-offline" };
  }
}
