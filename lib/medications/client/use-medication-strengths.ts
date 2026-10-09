"use client";

import { useEffect, useMemo, useState } from "react";
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

/** Same page-lifetime memory as `useDisplayNames`' (2026-10-09), keyed by everything a strength depends on. */
const resolvedStrengths = new Map<string, { strength: string | null; fromCatalog: boolean }>();

function strengthKey(med: UserMedicationRecord): string {
  return `${med.id}|${med.customStrengthValue ?? ""}|${med.customStrengthUnit ?? ""}|${med.catalogProductId ?? ""}`;
}

function forgetCatalogStrengths(): void {
  for (const [key, entry] of resolvedStrengths) if (entry.fromCatalog) resolvedStrengths.delete(key);
}

/** Today's dose cards need the medication's strength (e.g. "500 mg") alongside its name — same resolution shape as `useDisplayNames`, kept separate since not every caller of that hook needs strength too. */
export function useMedicationStrengths(medications: UserMedicationRecord[]): Map<string, string | null> {
  const [version, setVersion] = useState(0);

  useEffect(
    () =>
      onOfflineIndexUpdated(() => {
        forgetCatalogStrengths();
        setVersion((n) => n + 1);
      }),
    [],
  );

  useEffect(() => {
    const missing = medications.filter((med) => !resolvedStrengths.has(strengthKey(med)));
    if (missing.length === 0) return;
    let cancelled = false;
    const cache = new DexieCatalogCacheRepository();
    const offlineIndex = new DexieOfflineIndexRepository();
    Promise.all(
      missing.map(async (med) => {
        const strength = await resolveMedicationStrength(med, cache, offlineIndex);
        resolvedStrengths.set(strengthKey(med), { strength, fromCatalog: !med.customStrengthValue });
      }),
    ).then(
      () => {
        if (!cancelled) setVersion((n) => n + 1);
      },
      () => {
        // An IndexedDB read failed — retried on the next visit, not on every redraw.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [medications, version]);

  return useMemo(() => {
    const strengths = new Map<string, string | null>();
    for (const med of medications) {
      const entry = resolvedStrengths.get(strengthKey(med));
      if (entry) strengths.set(med.id, entry.strength);
    }
    return strengths;
    // `version` is how this hears that the module-level cache gained strengths.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medications, version]);
}
