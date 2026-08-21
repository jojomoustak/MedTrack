"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogProduct } from "@/lib/domain/catalog";
import { searchCatalog } from "@/lib/catalog/client/api";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { useNetworkStatus } from "@/lib/sync/client/use-network-status";
import { getClientDb, type LocalCatalogProductCache } from "@/lib/db-client/dexie";
import { logger } from "@/lib/logging/logger";

function stripCacheMetadata(cached: LocalCatalogProductCache): CatalogProduct {
  const product: Partial<LocalCatalogProductCache> = { ...cached };
  delete product.cachedAt;
  return product as CatalogProduct;
}

export type CatalogSearchStatus = "idle" | "loading" | "success" | "error" | "offline-cache";

export interface CatalogSearchState {
  status: CatalogSearchStatus;
  results: CatalogProduct[];
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

/** Rough client-side accent stripping so the offline cache fallback isn't strictly case-sensitive-ASCII-only — an approximation of the server's `unaccent()`, not a replacement for it (only the cache, already-seen data, is searched offline). */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Cache-first Greek catalog search (Phase 1 §7 / Phase 3 §2.4): while
 * online, queries the server (which does real `unaccent`/`pg_trgm`
 * search) and caches every result locally; while offline, falls back to
 * a best-effort search over whatever's already cached, so a previously
 * seen product is still findable without connectivity.
 */
const IDLE_STATE: CatalogSearchState = { status: "idle", results: [] };

export function useCatalogSearch(query: string): CatalogSearchState {
  const network = useNetworkStatus();
  const [state, setState] = useState<CatalogSearchState>(IDLE_STATE);
  const requestIdRef = useRef(0);

  const trimmed = useMemo(() => query.trim(), [query]);
  const tooShort = trimmed.length < MIN_QUERY_LENGTH;

  useEffect(() => {
    if (tooShort) {
      // Nothing to search yet — no request to fire, no state to reset via
      // an effect-driven setState; the render below already falls back to
      // IDLE_STATE directly for this case.
      requestIdRef.current++; // invalidate any in-flight request from a longer prior query
      return;
    }

    const requestId = ++requestIdRef.current;
    const timer = setTimeout(() => {
      void runSearch(trimmed, network, requestId, requestIdRef, setState);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed, tooShort, network]);

  return tooShort ? IDLE_STATE : state;
}

async function runSearch(
  query: string,
  network: ReturnType<typeof useNetworkStatus>,
  requestId: number,
  requestIdRef: { current: number },
  setState: (state: CatalogSearchState) => void,
) {
  setState({ status: "loading", results: [] });

  if (network === "online") {
    try {
      const response = await searchCatalog(query);
      if (requestIdRef.current !== requestId) return; // a newer query superseded this one
      setState({ status: "success", results: response.results });
      try {
        await new DexieCatalogCacheRepository(getClientDb()).cacheAll(response.results);
      } catch (err) {
        logger.warn("catalog.search.cache_write_failed", { message: (err as Error).message });
      }
      return;
    } catch (err) {
      logger.warn("catalog.search.network_failed", { message: (err as Error).message });
      // fall through to the offline cache fallback below
    }
  }

  try {
    const db = getClientDb();
    const normalizedQuery = normalize(query);
    const cached = await db.catalogProductCache.toArray();
    if (requestIdRef.current !== requestId) return;
    const matches = cached
      .filter((p) => normalize(p.name).includes(normalizedQuery) || (p.activeIngredient && normalize(p.activeIngredient).includes(normalizedQuery)))
      .map((cachedProduct) => stripCacheMetadata(cachedProduct));
    setState({ status: "offline-cache", results: matches });
  } catch (err) {
    logger.warn("catalog.search.offline_cache_failed", { message: (err as Error).message });
    setState({ status: "error", results: [] });
  }
}
