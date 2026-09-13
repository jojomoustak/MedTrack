/**
 * Storage-agnostic domain record shapes (ADR-001: the same shape is used
 * by both the server repository, backed by Postgres/Drizzle, and the
 * client repository, backed by IndexedDB/Dexie — ADR-008). Field names
 * are camelCase regardless of the underlying storage's column naming.
 *
 * `UserPreferences` (LWW) and `PurchaseList` (optimistic concurrency)
 * were Phase 5's proof-of-concept pair; Phase 6 adds `UserMedication`
 * (`lib/domain/user-medication.ts`) as the third — a real optimistic-
 * concurrency entity with an optional FK (`catalogProductId`), proving
 * the Phase 5 pattern generalizes. Entities without real CRUD yet are
 * still represented only by their `SyncEntityType` key
 * (`lib/domain/sync.ts`).
 */
import type { SyncState } from "@/lib/domain/sync";

/** Every client-mutable record carries these, matching Phase 2 §5's common columns. */
export interface SyncableRecord {
  syncState: SyncState;
}

/**
 * `UserPreferences` (Phase 2 §2.3). Account-scoped, not profile-scoped —
 * see `lib/db/rls.ts`'s `withAccountScope`. Conflict strategy:
 * last-write-wins on `clientUpdatedAt` (Phase 2 §5).
 */
export interface UserPreferencesRecord extends SyncableRecord {
  accountId: string;
  theme: "system" | "light" | "dark";
  language: string;
  reminderDefaultSnoozeMinutes: number;
  /** Stored as a string to stay JSON/IndexedDB-friendly and match the DB's NUMERIC(3,2) round-trip as text. */
  accessibilityTextScale: string;
  /** Server-set, authoritative for ordering once synced. */
  updatedAt: string;
  /** Device clock — the actual LWW comparator (Phase 2 §2.3). */
  clientUpdatedAt: string | null;
}

export const DEFAULT_USER_PREFERENCES: Omit<UserPreferencesRecord, "accountId" | "syncState"> = {
  theme: "system",
  language: "el",
  reminderDefaultSnoozeMinutes: 10,
  accessibilityTextScale: "1.00",
  updatedAt: new Date(0).toISOString(),
  clientUpdatedAt: null,
};

/**
 * `PurchaseList` (Phase 2 §2.12). Profile-scoped. Conflict strategy:
 * optimistic concurrency via `version` (Phase 2 §5) — a genuine
 * conflicting edit is surfaced, never silently overwritten.
 */
export interface PurchaseListRecord extends SyncableRecord {
  id: string;
  profileId: string;
  name: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
  /** The client_mutation_id of the mutation that produced this row's CURRENT local state (not history — one per row, overwritten on each new local edit). */
  clientMutationId: string;
}

/**
 * Snapshot of the server's version of a `PurchaseList` at the moment a
 * conflict was detected — kept alongside the local record so a future
 * resolution UI (Phase 6+) can show "on this phone" vs "on your other
 * device" (Phase 3 §8) without a second round trip.
 */
export interface PurchaseListConflictSnapshot {
  purchaseListId: string;
  serverRecord: Omit<PurchaseListRecord, "syncState">;
  detectedAt: string;
}

/** `PurchaseListItem.status` (Phase 2 §2.12's `chk_item_status`). */
export const PURCHASE_LIST_ITEM_STATUSES = ["pending", "purchased", "removed"] as const;
export type PurchaseListItemStatus = (typeof PURCHASE_LIST_ITEM_STATUSES)[number];

/**
 * `PurchaseListItem` (Phase 2 §2.12, Phase 13). Profile-scoped (denormalized
 * for RLS, same reasoning as every other profile-owned child row) and
 * belongs to exactly one `PurchaseList`. Conflict strategy: optimistic
 * concurrency via `version`, same as its parent — a genuine conflicting
 * edit (e.g. two devices both editing the price at once) is surfaced,
 * never silently overwritten.
 *
 * `userMedicationId` is optional — a shopping-list item doesn't require an
 * existing tracked medication ("vitamin D, not tracked yet" per the data
 * model's own example); `chk_item_has_label` requires at least one of
 * `userMedicationId`/`label` to be set, enforced both here (validation)
 * and by the database.
 *
 * `status` is the day-to-day shopping workflow (pending -> purchased, or
 * either -> removed if the user decides not to buy it after all) — a
 * lightweight, reversible state distinct from `deletedAt`, which is the
 * heavier sync-layer tombstone (Phase 2 §4.A) used only when the row
 * itself is being permanently deleted from the list, not just crossed
 * off.
 */
export interface PurchaseListItemRecord extends SyncableRecord {
  id: string;
  purchaseListId: string;
  profileId: string;
  userMedicationId: string | null;
  label: string | null;
  quantityValue: string | null;
  quantityUnit: string | null;
  /** Integer cents (CLAUDE.md rule 6) — never a float. */
  estimatedUnitPriceCents: number | null;
  actualPaidPriceCents: number | null;
  currency: string;
  status: PurchaseListItemStatus;
  purchasedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
  clientMutationId: string;
}
