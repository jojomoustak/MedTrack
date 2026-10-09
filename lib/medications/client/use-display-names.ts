"use client";

import { useEffect, useMemo, useState } from "react";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import { onOfflineIndexUpdated } from "@/lib/catalog/client/offline-index-signal";
import type { CatalogCacheRepository, OfflineIndexRepository } from "@/lib/domain/repositories";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import { shortCatalogName } from "@/lib/domain/catalog-short-name";

/**
 * The name-resolution rule itself, extracted so a non-React caller (e.g.
 * `lib/reminders/client/native-reminder-sync.ts`, which needs the same
 * medication label for a push notification) can reuse it without needing
 * `useDisplayNames`'s hook lifecycle.
 *
 * A catalog-linked medication goes by its everyday name
 * (`shortCatalogName`: "FLAGYL 500mg"); `full` gives the official
 * description instead ("FLAGYL CAPS 500MG/CAP BTX30") — only the edit
 * screen asks for it (2026-10-09). A name the user typed is theirs and is
 * shown as typed either way.
 */
export async function resolveMedicationDisplayName(
  med: UserMedicationRecord,
  cache: Pick<CatalogCacheRepository, "get">,
  offlineIndex: Pick<OfflineIndexRepository, "getById">,
  { full = false }: { full?: boolean } = {},
): Promise<string | null> {
  if (med.customName) return med.customName;
  const name = await resolveCatalogName(med, cache, offlineIndex);
  return name && !full ? shortCatalogName(name) : name;
}

async function resolveCatalogName(
  med: UserMedicationRecord,
  cache: Pick<CatalogCacheRepository, "get">,
  offlineIndex: Pick<OfflineIndexRepository, "getById">,
): Promise<string | null> {
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
 * Resolved names, remembered for the life of the page and keyed by
 * everything a name depends on (a rename or a different catalog product is
 * a different key). Every screen used to resolve every name again on
 * every visit, one IndexedDB read after another, showing "…" meanwhile
 * (2026-10-09); now a name resolved once is there on the first frame.
 * Catalog names are forgotten when the offline index updates (see below).
 */
const resolvedNames = new Map<string, { name: string; fromCatalog: boolean }>();

function nameKey(med: UserMedicationRecord, full: boolean): string {
  return `${full ? "full" : "short"}|${med.id}|${med.customName ?? ""}|${med.catalogProductId ?? ""}`;
}

function forgetCatalogNames(): void {
  for (const [key, entry] of resolvedNames) if (entry.fromCatalog) resolvedNames.delete(key);
}

/** Test seam. */
export function __clearResolvedNamesForTests(): void {
  resolvedNames.clear();
}

/**
 * Extracted from `app/(app)/medications/page.tsx` (2026-08-30, Phase 10)
 * — was a module-local, unexported hook; Today's dose cards need the
 * exact same medication-name resolution, so this is the shared home for
 * it rather than a second, drifting copy.
 */
export function useDisplayNames(medications: UserMedicationRecord[], { full = false }: { full?: boolean } = {}): Map<string, string> {
  const [version, setVersion] = useState(0);

  // Real bug (2026-08-28, see offline-index-signal.ts's doc): re-resolves
  // when the offline index finishes syncing in the background, not just
  // when `medications` itself changes — otherwise a name resolved before
  // that sync completed (the common case right after a fresh reinstall +
  // login) is stuck on the placeholder forever, even though the real data
  // arrives moments later.
  useEffect(
    () =>
      onOfflineIndexUpdated(() => {
        forgetCatalogNames();
        setVersion((n) => n + 1);
      }),
    [],
  );

  useEffect(() => {
    const missing = medications.filter((med) => !resolvedNames.has(nameKey(med, full)));
    if (missing.length === 0) return;
    let cancelled = false;
    const cache = new DexieCatalogCacheRepository();
    const offlineIndex = new DexieOfflineIndexRepository();
    Promise.all(
      missing.map(async (med) => {
        const name = await resolveMedicationDisplayName(med, cache, offlineIndex, { full });
        resolvedNames.set(nameKey(med, full), { name: name ?? "Φάρμακο από κατάλογο", fromCatalog: !med.customName });
      }),
    ).then(
      () => {
        if (!cancelled) setVersion((n) => n + 1);
      },
      () => {
        // An IndexedDB read failed — the name stays "…" and is retried on the next visit (not on every redraw).
      },
    );
    return () => {
      cancelled = true;
    };
  }, [medications, full, version]);

  return useMemo(() => {
    const names = new Map<string, string>();
    for (const med of medications) {
      const entry = resolvedNames.get(nameKey(med, full));
      if (entry) names.set(med.id, entry.name);
    }
    return names;
    // `version` is how this hears that the module-level cache gained names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medications, full, version]);
}
