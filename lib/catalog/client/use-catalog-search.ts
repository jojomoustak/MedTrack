"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogProduct } from "@/lib/domain/catalog";
import { searchCatalog } from "@/lib/catalog/client/api";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import { offlineIndexEntryToCatalogProduct } from "@/lib/domain/offline-index";
import { useNetworkStatus } from "@/lib/sync/client/use-network-status";
import { getClientDb } from "@/lib/db-client/dexie";
import { logger } from "@/lib/logging/logger";

export type CatalogSearchStatus = "idle" | "loading" | "success" | "error" | "offline-cache";

export interface CatalogSearchState {
  status: CatalogSearchStatus;
  results: CatalogProduct[];
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

/**
 * Offline-first Greek catalog search (Phase 1 §7 / Phase 3 §2.4, catalog-
 * coverage task spec §23): while online, queries the server (real
 * `unaccent`/`pg_trgm` search) and caches every result locally; while
 * offline, searches the SAME compact offline index scan resolution uses
 * (`OfflineIndexRepository`, spec §17/§22) — never a second, separate
 * search-only local database — so any synced product is findable
 * offline by name or active ingredient, not just ones this device has
 * personally looked up before.
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
    const offlineIndex = new DexieOfflineIndexRepository(getClientDb());
    const entries = await offlineIndex.search(query, 20);
    if (requestIdRef.current !== requestId) return;
    setState({ status: "offline-cache", results: entries.map(offlineIndexEntryToCatalogProduct) });
  } catch (err) {
    logger.warn("catalog.search.offline_index_failed", { message: (err as Error).message });
    setState({ status: "error", results: [] });
  }
}
