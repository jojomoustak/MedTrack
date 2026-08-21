/**
 * `UserMedication` (Phase 2 §2.5, ADR-004) — the third entity wired
 * through the Phase 5 outbox/sync pattern, and the first with an
 * optional FK (`catalogProductId`: set when created from catalog search,
 * `null` for manual entry — ADR-004's "never merged" rule: a catalog
 * match is a relationship, not a copy). Conflict strategy: optimistic
 * concurrency via `version` (Phase 2 §5), same mechanism as `PurchaseList`.
 */
import type { SyncableRecord } from "@/lib/domain/entities";

export type MedicationForm =
  | "tablet"
  | "capsule"
  | "ml"
  | "mg"
  | "mcg"
  | "g"
  | "dose"
  | "spray"
  | "drop"
  | "sachet"
  | "patch"
  | "injection"
  | "other";

export type TreatmentState = "active" | "completed" | "paused" | "discontinued";

export interface UserMedicationRecord extends SyncableRecord {
  id: string;
  profileId: string;
  /** Set when created from a catalog search result; `null` for manual entry (ADR-004 — optional, never required, never merged into a single row). */
  catalogProductId: string | null;
  /**
   * Manual-entry display name (`chk_catalog_or_manual`: this OR
   * `catalogProductId` must be set). When `catalogProductId` is set,
   * rendering the medication's name is the UI's job — look up the
   * cached catalog product (`lib/db-client/catalog-cache-repository.ts`)
   * rather than duplicating its name into this row (ADR-004: a
   * relationship, not a copy).
   */
  customName: string | null;
  customForm: MedicationForm | null;
  customStrengthValue: string | null;
  customStrengthUnit: string | null;
  treatmentState: TreatmentState;
  inventoryUnit: MedicationForm;
  lowStockThresholdValue: string | null;
  expiryWarningDays: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
  clientMutationId: string;
}
