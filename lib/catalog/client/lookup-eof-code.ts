import type { CatalogCacheRepository } from "@/lib/domain/repositories";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { lookupCatalogByEofCode } from "@/lib/catalog/client/api";
import type { NetworkState } from "@/lib/sync/client/network";
import { logger } from "@/lib/logging/logger";
import type { CatalogLookupOutcome } from "@/lib/catalog/client/lookup-gtin";

/**
 * EOF-code lookup for Path A of the scan flow
 * (medication-resolution-architecture.md §2.5) — the `lookupEofCode`
 * analogue of `lookup-gtin.ts`'s `lookupGtin`, same local-cache-first,
 * server-if-online-and-uncached shape. Kept as its own function rather
 * than a `lookupGtin(key, kind)` parameter: the two paths have distinct
 * cache indexes, distinct API query params, and distinct meaning (a
 * cache/server miss for a *valid* Greek national code is a materially
 * different situation from an unrecognized GTIN — see `ScanStep.tsx`'s
 * `recognizedButUnavailable` handling), so keeping them as parallel,
 * separately-readable functions matches this codebase's existing
 * `search`/`lookup` pairing more than a shared generic would.
 */
export async function lookupEofCode(
  eofCode: string,
  network: NetworkState,
  deps: { cache?: CatalogCacheRepository; fetchImpl?: typeof fetch } = {},
): Promise<CatalogLookupOutcome> {
  const cache = deps.cache ?? new DexieCatalogCacheRepository();

  const cached = await cache.getByEofCode(eofCode);
  if (cached) return { status: "found", product: cached };

  if (network !== "online") {
    return { status: "unresolved-offline" };
  }

  try {
    const response = await lookupCatalogByEofCode(eofCode, deps.fetchImpl);
    if (!response.product) return { status: "not-found" };
    await cache.cacheAll([response.product]);
    return { status: "found", product: response.product };
  } catch (err) {
    logger.warn("catalog.lookup_eof_code.network_failed", { message: (err as Error).message });
    return { status: "unresolved-offline" };
  }
}
