/**
 * `MedicationInventoryTransaction` — the append-only ledger (Phase 2 §2.9,
 * ADR-010, Phase 9). Conflict strategy: idempotent write by stable ID, same
 * as `DoseEvent` — never optimistic concurrency (there is nothing to edit;
 * a correction is a new offsetting `manual_correction` row, never a change
 * to a past one). `uq_inventory_txn_dose_taken_once` (server-enforced) is
 * the hard backstop against a retried "taken" mutation double-consuming
 * stock even if every application-layer dedupe fails.
 *
 * Current stock for a medication is always
 * `SUM(quantityDelta) WHERE userMedicationId = X` over these rows — never
 * a stored counter anywhere in this codebase.
 */
import type { SyncableRecord } from "@/lib/domain/entities";

export const INVENTORY_TRANSACTION_TYPES = [
  "package_opened",
  "dose_taken",
  "refill",
  "manual_correction",
  "package_discarded",
  "dose_reversed",
] as const;
export type InventoryTransactionType = (typeof INVENTORY_TRANSACTION_TYPES)[number];

export const INVENTORY_TRANSACTION_SOURCES = ["user", "system", "sync_recovery"] as const;
export type InventoryTransactionSource = (typeof INVENTORY_TRANSACTION_SOURCES)[number];

/** `chk_dose_txn_has_event` (Phase 2 §2.9) — `dose_taken`/`dose_reversed` always carry the originating `doseEventId`; every other type never does. Expressed as a pure function so client and server derive the identical requirement rather than trusting either side. */
export function requiresDoseEventId(type: InventoryTransactionType): boolean {
  return type === "dose_taken" || type === "dose_reversed";
}

export interface InventoryTransactionRecord extends SyncableRecord {
  id: string;
  profileId: string;
  userMedicationId: string;
  /** Which physical package this consumption/adjustment is attributed to — `null` when unknown or not applicable (see `lib/domain/inventory-consumption.ts` for the FIFO attribution rule). */
  packageId: string | null;
  transactionType: InventoryTransactionType;
  /** Signed — positive for stock added (`package_opened`, `refill`), negative for stock consumed (`dose_taken`, `manual_correction` going down). Never zero (`chk_inventory_txn_delta_nonzero`, server-enforced). */
  quantityDelta: string;
  quantityUnit: string;
  /** Set only for `dose_taken`/`dose_reversed` (`requiresDoseEventId`). */
  doseEventId: string | null;
  /** When this consumption/adjustment actually happened, per the user — may predate `recordedAt` for an offline write that synced later. */
  occurredAt: string;
  /** Server write time — audit only, never used for ledger math. */
  recordedAt: string;
  source: InventoryTransactionSource;
  note: string | null;
  clientMutationId: string;
}

export type CreateInventoryTransactionInput = Omit<InventoryTransactionRecord, "recordedAt" | "syncState">;
