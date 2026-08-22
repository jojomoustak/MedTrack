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
