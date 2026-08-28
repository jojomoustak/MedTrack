/**
 * Client-side IndexedDB store (ADR-008, Dexie). Covers what Phase 1 §4
 * requires available offline: active medications, schedules, current
 * inventory, dose events, recent history/favorites/lists/preferences,
 * cached catalog metadata — plus the outbox itself.
 *
 * Every table below is a real, indexed Dexie table (proving the storage
 * layer can hold the full offline dataset per Phase 1 §4).
 * `userPreferences`, `purchaseList`, `userMedication`, `outbox`, and
 * `catalogProductCache` have real repository implementations
 * (`lib/db-client/*-repository.ts`, Phase 5 + Phase 6); the rest are
 * schema-only until a later phase builds real CRUD for them — a
 * deliberate proof-of-concept scope, not an oversight.
 *
 * Nothing outside `lib/db-client/` may import `dexie` or touch this
 * class directly — always go through a repository (ADR-008).
 */
import Dexie, { type EntityTable } from "dexie";
import type { OutboxEntry } from "@/lib/domain/outbox";
import type { PurchaseListRecord, UserPreferencesRecord } from "@/lib/domain/entities";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import type { CatalogProduct } from "@/lib/domain/catalog";
import type { UnresolvedScanRecord } from "@/lib/domain/repositories";
import type { OfflineIndexEntry } from "@/lib/domain/offline-index";
import type { LearnedGtinMapping } from "@/lib/domain/learned-mapping";
import { notifyOutboxWrite } from "@/lib/sync/client/outbox-signal";

export interface LocalMedicationSchedule {
  id: string;
  profileId: string;
  userMedicationId: string;
  scheduleKind: string;
  syncState: string;
  deletedAt: string | null;
}

export interface LocalDoseEvent {
  id: string;
  profileId: string;
  userMedicationId: string;
  scheduledAt: string | null;
  status: string;
  syncState: string;
}

export interface LocalFavorite {
  id: string;
  profileId: string;
  userMedicationId: string;
  syncState: string;
  removedAt: string | null;
}

export interface LocalRecentlyUsedEvent {
  id: string;
  profileId: string;
  userMedicationId: string;
  interactionType: string;
  occurredAt: string;
}

export interface LocalPurchaseListItem {
  id: string;
  purchaseListId: string;
  profileId: string;
  label: string | null;
  status: string;
  syncState: string;
  deletedAt: string | null;
}

/**
 * Read-mostly cache of catalog products this device has actually seen
 * (search results the user viewed, or a resolved GTIN lookup once Phase
 * 7-8 builds scanning) — never has local writes/outbox entries
 * (server-authoritative, Phase 2 §2.4). Holds the FULL product shape (not
 * just id/name) so a `UserMedication` created from a catalog match can
 * still render its name/strength/form while offline, per Phase 1 §7's
 * "local cache first" rule.
 */
export interface LocalCatalogProductCache extends CatalogProduct {
  cachedAt: string;
}

/** Dexie's on-disk shape for `UnresolvedScanRecord` (`lib/domain/repositories.ts`) — no extra storage metadata needed, unlike `LocalCatalogProductCache`, since every field here is already client-local by definition. */
export type LocalUnresolvedScan = UnresolvedScanRecord;

/**
 * The full compact offline index (spec §12/§17) — distinct from, and
 * eventually superseding for lookup purposes, `catalogProductCache` above
 * (which only ever held products this specific device had actually
 * looked up online — the "seen-products-only cache" spec §22 calls out
 * for replacement). This table holds the WHOLE synced authoritative
 * catalog, so a never-before-scanned-on-this-device product still
 * resolves offline. Always written as a complete replacement in one
 * transaction (`lib/db-client/offline-index-repository.ts`'s
 * `replaceAll`), never incrementally — see that file for why.
 */
export type LocalOfflineIndexEntry = OfflineIndexEntry;

/** Single-row table (`id` always `"current"`) tracking which offline-index version is currently active locally — compared against the server's manifest to decide whether a re-sync is needed (spec §16). */
export interface OfflineIndexMetaRecord {
  id: "current";
  version: string;
  recordCount: number;
  generatedAt: string;
  syncedAt: string;
}

export class MedTrackingDexie extends Dexie {
  outbox!: EntityTable<OutboxEntry, "clientMutationId">;
  userPreferences!: EntityTable<UserPreferencesRecord, "accountId">;
  purchaseList!: EntityTable<PurchaseListRecord, "id">;
  purchaseListItem!: EntityTable<LocalPurchaseListItem, "id">;
  userMedication!: EntityTable<UserMedicationRecord, "id">;
  medicationSchedule!: EntityTable<LocalMedicationSchedule, "id">;
  doseEvent!: EntityTable<LocalDoseEvent, "id">;
  favorite!: EntityTable<LocalFavorite, "id">;
  recentlyUsedEvent!: EntityTable<LocalRecentlyUsedEvent, "id">;
  catalogProductCache!: EntityTable<LocalCatalogProductCache, "id">;
  unresolvedScan!: EntityTable<LocalUnresolvedScan, "id">;
  offlineIndexEntry!: EntityTable<LocalOfflineIndexEntry, "id">;
  offlineIndexMeta!: EntityTable<OfflineIndexMetaRecord, "id">;
  learnedGtinMapping!: EntityTable<LearnedGtinMapping, "gtin">;

  constructor(name = "medtracking") {
    super(name);
    this.version(1).stores({
      // `nextAttemptAt` indexed so the sync worker can efficiently query "due" entries.
      outbox: "clientMutationId, entityType, entityId, status, nextAttemptAt",
      userPreferences: "accountId",
      purchaseList: "id, profileId, syncState, deletedAt",
      purchaseListItem: "id, purchaseListId, profileId, syncState",
      userMedication: "id, profileId, treatmentState, syncState, deletedAt",
      medicationSchedule: "id, profileId, userMedicationId, syncState, deletedAt",
      doseEvent: "id, profileId, userMedicationId, scheduledAt, status, syncState",
      favorite: "id, profileId, userMedicationId, syncState",
      recentlyUsedEvent: "id, profileId, userMedicationId, occurredAt",
      catalogProductCache: "id, gtin, name, cachedAt",
      unresolvedScan: "id, profileId, gtin, resolvedAt",
    });

    // v2: adds an `eofCode` index to `catalogProductCache` for Path A
    // lookups (medication-resolution-architecture.md §2.5,
    // `lib/db-client/catalog-cache-repository.ts`'s `getByEofCode`). A new
    // version, not an edit to v1's `stores()` above — this app already has
    // real installed local data (it's in active personal use), and Dexie
    // requires a version bump to add an index to an existing table rather
    // than silently changing an already-shipped schema. Only the changed
    // table needs to be listed; every other v1 table carries forward
    // unchanged automatically.
    this.version(2).stores({
      catalogProductCache: "id, gtin, eofCode, name, cachedAt",
    });

    // v3: the full compact offline index (spec §12/§17) — new tables, no
    // change to any v1/v2 table, so no migration concern for existing
    // installs beyond Dexie's own additive-version handling.
    this.version(3).stores({
      offlineIndexEntry: "id, eofCode, gtin, name",
      offlineIndexMeta: "id",
    });

    // v4: `*gtins` is a Dexie multiEntry index (the leading `*`) — it
    // indexes every element of the `gtins` array individually, so
    // `.where("gtins").equals(x)` finds the one product whose array
    // CONTAINS `x`, in O(1), with no join and no duplicating product
    // metadata per identifier (GTIN-resolution task spec §5/§12: "one
    // package may have... possibly additional valid GTINs" without a
    // separate identifiers table on the client side — the array-plus-
    // multiEntry-index approach achieves the same "each identifier maps
    // back to one product record" property spec §12 asks for, just without
    // a second table, which the server side genuinely needs (for
    // provenance/conflict tracking, `medication_identifier`) but the
    // device's read-only compact index does not).
    this.version(4).stores({
      offlineIndexEntry: "id, eofCode, gtin, *gtins, name",
    });

    // v5: device-local learned GTIN mappings (OCR-fallback task spec §12-
    // §15) — `gtin` is the primary key (one confirmed product per GTIN per
    // device; a genuine same-device re-confirmation-of-a-different-product
    // is handled at the application layer as an explicit overwrite-with-
    // logging, not a silent Dexie `put()` collision — see
    // `lib/db-client/learned-mapping-repository.ts`). `syncedAt` is
    // deliberately NOT a secondary Dexie index: it's `string | null`, and
    // IndexedDB doesn't accept `null` as an index key at all (rows with a
    // `null` indexed value are simply never findable via that index) — this
    // table only ever holds a handful of rows (one per medicine a user has
    // personally OCR-confirmed), so `listUnsynced()` does a plain in-memory
    // filter over `toArray()` rather than working around that with a
    // sentinel value.
    this.version(5).stores({
      learnedGtinMapping: "gtin",
    });

    // Single choke point for "a new outbox entry was durably written" —
    // every repository's write path (direct `enqueue()`, or a raw
    // `outbox.put()` inside a larger multi-table transaction) passes
    // through this table, so hooking it here catches all of them without
    // needing every call site to remember to signal the sync manager
    // itself. Deferred to the transaction's `complete` event so the
    // signal only fires once the write is actually committed, not
    // speculatively during an in-flight transaction that could still
    // abort. See `lib/sync/client/outbox-signal.ts` for why this exists.
    this.outbox.hook("creating", (_primKey, _obj, transaction) => {
      transaction.on("complete", () => notifyOutboxWrite());
    });
  }
}

let dbSingleton: MedTrackingDexie | undefined;

/**
 * Lazy singleton — constructing a Dexie instance touches `indexedDB`,
 * which doesn't exist during server-side rendering/build. Every caller
 * MUST go through this getter rather than `new MedTrackingDexie()`
 * directly, and MUST only call it from client-side code (a `"use
 * client"` component, a browser-only effect, etc.).
 */
export function getClientDb(): MedTrackingDexie {
  if (typeof indexedDB === "undefined") {
    throw new Error("getClientDb() called in an environment with no IndexedDB (server-side?). This is a client-only store.");
  }
  if (!dbSingleton) {
    dbSingleton = new MedTrackingDexie();
  }
  return dbSingleton;
}

/** Test-only: swap in a fresh instance (e.g. pointed at `fake-indexeddb`) or reset the singleton between tests. */
export function __setClientDbForTests(db: MedTrackingDexie | undefined): void {
  dbSingleton = db;
}
