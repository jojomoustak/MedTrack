"use client";

import { useEffect, useState } from "react";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import { onOfflineIndexUpdated } from "@/lib/catalog/client/offline-index-signal";
import { formatQuantity } from "@/lib/domain/quantity";
import type { CatalogCacheRepository, OfflineIndexRepository } from "@/lib/domain/repositories";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

/**
 * Same shape as `resolveMedicationDisplayName` (`use-display-names.ts`),
 * for the same reason: a manually-entered medication carries its own
 * strength directly, but a catalog-linked one (ADR-004 — "a relationship,
 * never merged into a copy") only has it via the cached catalog product,
 * resolved the same cache-first-then-offline-index way the name is.
 */
export async function resolveMedicationStrength(
  med: UserMedicationRecord,
  cache: Pick<CatalogCacheRepository, "get">,
  offlineIndex: Pick<OfflineIndexRepository, "getById">,
): Promise<string | null> {
  if (med.customStrengthValue) {
    return `${formatQuantity(med.customStrengthValue)}${med.customStrengthUnit ? ` ${med.customStrengthUnit}` : ""}`;
  }
  if (!med.catalogProductId) return null;
  const cached = await cache.get(med.catalogProductId);
  if (cached?.strengthValue) return `${formatQuantity(cached.strengthValue)}${cached.strengthUnit ? ` ${cached.strengthUnit}` : ""}`;
  const indexed = await offlineIndex.getById(med.catalogProductId);
  if (indexed?.strengthValue) return `${formatQuantity(indexed.strengthValue)}${indexed.strengthUnit ? ` ${indexed.strengthUnit}` : ""}`;
  return null;
}

/** Today's dose cards need the medication's strength (e.g. "500 mg") alongside its name — same resolution shape as `useDisplayNames`, kept separate since not every caller of that hook needs strength too. */
export function useMedicationStrengths(medications: UserMedicationRecord[]): Map<string, string | null> {
  const [strengths, setStrengths] = useState<Map<string, string | null>>(new Map());
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => onOfflineIndexUpdated(() => setRefreshNonce((n) => n + 1)), []);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      const cache = new DexieCatalogCacheRepository();
      const offlineIndex = new DexieOfflineIndexRepository();
      const map = new Map<string, string | null>();
      for (const med of medications) {
        map.set(med.id, await resolveMedicationStrength(med, cache, offlineIndex));
      }
      if (!cancelled) setStrengths(map);
    }
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [medications, refreshNonce]);

  return strengths;
}
