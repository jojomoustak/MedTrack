/**
 * Sync-state vocabulary shared by every synchronizable entity
 * (`designing-offline-sync`, Phase 1 §5, Phase 2 §5). UI and repository
 * code should import this rather than re-declaring the union inline.
 */
export const SYNC_STATES = [
  "local-only",
  "pending",
  "syncing",
  "synced",
  "conflict",
  "failed",
  "deleted",
] as const;

export type SyncState = (typeof SYNC_STATES)[number];

/** Per-entity conflict resolution strategy (Phase 2 §5 finalized table). */
export type ConflictStrategy =
  | "last-write-wins"
  | "optimistic-concurrency"
  | "append-only-ledger-merge"
  | "idempotent-by-id"
  | "server-authoritative-no-client-writes";

export const ENTITY_CONFLICT_STRATEGY = {
  userPreferences: "last-write-wins",
  medicationCatalogProduct: "server-authoritative-no-client-writes",
  userMedication: "optimistic-concurrency",
  medicationSchedule: "optimistic-concurrency",
  medicationPackage: "optimistic-concurrency",
  medicationInventoryTransaction: "append-only-ledger-merge",
  doseEvent: "idempotent-by-id",
  favorite: "last-write-wins",
  recentlyUsedEvent: "idempotent-by-id",
  purchaseList: "optimistic-concurrency",
  purchaseListItem: "optimistic-concurrency",
} as const satisfies Record<string, ConflictStrategy>;

export type SyncEntityType = keyof typeof ENTITY_CONFLICT_STRATEGY;
