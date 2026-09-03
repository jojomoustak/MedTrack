"use client";

import { useEffect, useState } from "react";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import { onOfflineIndexUpdated } from "@/lib/catalog/client/offline-index-signal";
import type { CatalogCacheRepository, OfflineIndexRepository } from "@/lib/domain/repositories";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

/**
 * The name-resolution rule itself, extracted so a non-React caller (e.g.
 * `lib/reminders/client/native-reminder-sync.ts`, which needs the same
 * medication label for a push notification) can reuse it without needing
 * `useDisplayNames`'s hook lifecycle.
 */
export async function resolveMedicationDisplayName(
  med: UserMedicationRecord,
  cache: Pick<CatalogCacheRepository, "get">,
  offlineIndex: Pick<OfflineIndexRepository, "getById">,
): Promise<string | null> {
  if (med.customName) return med.customName;
  if (!med.catalogProductId) return null;
  // `catalogProductCache` first (cheap, already-seen-on-this-device
  // products) — falls back to the full compact offline index
  // (`OfflineIndexRepository.getById`) when it misses, rather than going
  // straight to the generic placeholder. This self-heals any medication
  // created before 2026-08-28's cache-write fix (a real bug:
  // offline-index-resolved scans/OCR confirmations used to never write
  // into `catalogProductCache` at all, so an already-created medication's
  // name could be permanently stuck on the placeholder even after that
  // fix, since the fix only changed what happens on FUTURE resolutions) —
  // the offline index still has this product's data by id regardless.
  const cached = await cache.get(med.catalogProductId);
  if (cached) return cached.name;
  const indexed = await offlineIndex.getById(med.catalogProductId);
  return indexed?.name ?? null;
}

/**
 * Extracted from `app/(app)/medications/page.tsx` (2026-08-30, Phase 10)
 * — was a module-local, unexported hook; Today's dose cards need the
 * exact same medication-name resolution, so this is the shared home for
 * it rather than a second, drifting copy.
 */
export function useDisplayNames(medications: UserMedicationRecord[]): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Real bug (2026-08-28, see offline-index-signal.ts's doc): re-resolves
  // when the offline index finishes syncing in the background, not just
  // when `medications` itself changes — otherwise a name resolved before
  // that sync completed (the common case right after a fresh reinstall +
  // login) is stuck on the placeholder forever, even though the real data
  // arrives moments later.
  useEffect(() => onOfflineIndexUpdated(() => setRefreshNonce((n) => n + 1)), []);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      const cache = new DexieCatalogCacheRepository();
      const offlineIndex = new DexieOfflineIndexRepository();
      const map = new Map<string, string>();
      for (const med of medications) {
        const name = await resolveMedicationDisplayName(med, cache, offlineIndex);
        map.set(med.id, name ?? "Φάρμακο από κατάλογο");
      }
      if (!cancelled) setNames(map);
    }
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [medications, refreshNonce]);

  return names;
}
