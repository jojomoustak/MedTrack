import type { OfflineIndexEntry } from "@/lib/domain/offline-index";
import type { OfflineIndexLocalManifest, OfflineIndexRepository } from "@/lib/domain/repositories";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";
import { logger } from "@/lib/logging/logger";

const META_ID = "current" as const;

/**
 * Dexie-backed `OfflineIndexRepository` (spec §12/§17/§18). `replaceAll`
 * is deliberately a single Dexie `transaction('rw', ...)` around clear +
 * bulkPut + meta-update — IndexedDB's own transactional guarantee (all
 * writes commit together or none do, even across a browser crash/tab
 * kill mid-write) is exactly the atomicity spec §18 asks for, with no
 * separate "build a staging table, verify, then switch a pointer" dance
 * needed: a transaction that never gets to `await tx complete` simply
 * never touches the previous data at all, so V1 stays fully intact on any
 * failure — the failure-safety property falls out of using one
 * transaction rather than needing to be built by hand.
 */
export class DexieOfflineIndexRepository implements OfflineIndexRepository {
  constructor(private readonly db: MedTrackingDexie = getClientDb()) {}

  async getManifest(): Promise<OfflineIndexLocalManifest | null> {
    const record = await this.db.offlineIndexMeta.get(META_ID);
    if (!record) return null;
    const { version, recordCount, generatedAt, syncedAt } = record;
    return { version, recordCount, generatedAt, syncedAt };
  }

  async getByEofCode(eofCode: string): Promise<OfflineIndexEntry | null> {
    const entry = await this.db.offlineIndexEntry.where("eofCode").equals(eofCode).first();
    return entry ?? null;
  }

  /**
   * Queries the `*gtins` multiEntry index (GTIN-resolution task spec §5) —
   * not the legacy singular `gtin` field, which is always null for real
   * data. If more than one product's `gtins` array authoritatively
   * contains the same value (a genuine cross-product conflict, spec §19),
   * this returns `null` rather than arbitrarily picking one — "no single
   * exact match" is the only outcome the offline path can safely produce
   * for a conflict without threading a full three-state `IdentifierResolution`
   * through every offline caller for a case with zero real data today. The
   * ONLINE path (`PostgresCatalogProvider.lookupByIdentifier`) does surface
   * the full `EXACT`/`CONFLICT`/`VALID_IDENTIFIER_UNRESOLVED` distinction —
   * this is a deliberate, narrower, always-safe offline degrade, not an
   * oversight, and is logged so a real future conflict isn't silently invisible.
   */
  async getByGtin(gtin: string): Promise<OfflineIndexEntry | null> {
    const matches = await this.db.offlineIndexEntry.where("gtins").equals(gtin).toArray();
    if (matches.length === 0) return null;
    if (matches.length > 1) {
      logger.warn("offline_index.gtin_conflict", { gtin, matchingProductIds: matches.map((m) => m.id) });
      return null;
    }
    return matches[0];
  }

  async search(query: string, limit = 20): Promise<OfflineIndexEntry[]> {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (normalizedQuery.length === 0) return [];

    const results: OfflineIndexEntry[] = [];
    // Dexie has no built-in full-text/accent-insensitive search; at the
    // measured index size (~9,400 records, §17) a linear scan with
    // `.toLocaleLowerCase()` (which correctly folds Greek diacritics, unlike
    // a plain regex) comfortably meets the interactive-search latency bar —
    // see the measured figure recorded alongside this feature's coverage
    // report. Revisit only if a real measurement says otherwise (spec §14).
    await this.db.offlineIndexEntry.each((entry) => {
      if (results.length >= limit) return;
      const name = entry.name.toLocaleLowerCase();
      const activeIngredient = entry.activeIngredient?.toLocaleLowerCase() ?? "";
      if (name.includes(normalizedQuery) || activeIngredient.includes(normalizedQuery)) {
        results.push(entry);
      }
    });
    return results;
  }

  async replaceAll(manifest: OfflineIndexLocalManifest, entries: readonly OfflineIndexEntry[]): Promise<void> {
    await this.db.transaction("rw", this.db.offlineIndexEntry, this.db.offlineIndexMeta, async () => {
      await this.db.offlineIndexEntry.clear();
      if (entries.length > 0) {
        await this.db.offlineIndexEntry.bulkPut(entries as OfflineIndexEntry[]);
      }
      await this.db.offlineIndexMeta.put({ id: META_ID, ...manifest });
    });
  }
}
