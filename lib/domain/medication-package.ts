/**
 * `MedicationPackage` (Phase 2 §2.8, Phase 9). Conflict strategy:
 * optimistic concurrency via `version`, same mechanism as
 * `MedicationSchedule`/`UserMedication` — creation is idempotent-by-ID,
 * mutable fields (`status`/`openedAt`) use `version` to detect a genuine
 * concurrent edit.
 *
 * Remaining quantity is deliberately NOT a field here — it's always a
 * derived sum over `MedicationInventoryTransaction` rows tagged with this
 * package's id (`lib/domain/inventory-transaction.ts`), never a stored,
 * independently-editable counter (ADR-010).
 */
import type { SyncableRecord } from "@/lib/domain/entities";

export const MEDICATION_PACKAGE_SOURCES = ["scan", "manual"] as const;
export type MedicationPackageSource = (typeof MEDICATION_PACKAGE_SOURCES)[number];

export const MEDICATION_PACKAGE_STATUSES = ["unopened", "opened", "depleted", "discarded", "expired"] as const;
export type MedicationPackageStatus = (typeof MEDICATION_PACKAGE_STATUSES)[number];

export interface MedicationPackageRecord extends SyncableRecord {
  id: string;
  profileId: string;
  userMedicationId: string;
  source: MedicationPackageSource;
  /** Present when `source === "scan"`. */
  gtin: string | null;
  batchNumber: string | null;
  serialNumber: string | null;
  /** "YYYY-MM-DD", or `null` when the package/scan carried no expiry. */
  expiryDate: string | null;
  /** "YYYY-MM-DD" — defaults to today when the user doesn't set one explicitly. */
  receivedDate: string;
  initialQuantityValue: string;
  quantityUnit: string;
  status: MedicationPackageStatus;
  /** ISO instant — set the moment `status` transitions to `"opened"`; `null` while still `"unopened"`. */
  openedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
  clientMutationId: string;
}

export type CreateMedicationPackageInput = Omit<
  MedicationPackageRecord,
  "createdAt" | "updatedAt" | "version" | "deletedAt" | "syncState" | "status" | "openedAt"
>;

/** Fields a package EDIT can change — `initialQuantityValue`/`quantityUnit`/`source` describe what arrived and are immutable after creation (a correction to the ledger, not to this record, per ADR-010). */
export type MedicationPackagePatch = Partial<Pick<MedicationPackageRecord, "batchNumber" | "serialNumber" | "expiryDate" | "status" | "openedAt">>;
