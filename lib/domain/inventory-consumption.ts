/**
 * Inventory ledger math (Phase 9, ADR-010) — FIFO package attribution for
 * a `dose_taken` transaction, current-stock derivation, and a low-stock /
 * refill-out projection. Pure functions over already-fetched records (no
 * I/O), same convention as `lib/scheduling/client/dose-event-generator.ts`,
 * so this runs identically client-side (against a local Dexie snapshot,
 * used to build the ledger row a "Taken" tap enqueues) and could run
 * server-side against the same shape if ever needed.
 *
 * Design (data-architect, 2026-09-04): the client computes FIFO
 * attribution against its own local view and sends the result (a fully-
 * formed `dose_taken` row with `packageId` already set) — the server does
 * not independently re-run FIFO, it only enforces the hard constraints
 * (`uq_inventory_txn_dose_taken_once`, `chk_dose_txn_has_event`,
 * `chk_inventory_txn_delta_nonzero`). This mirrors the existing trust
 * model for client-computed `DoseEvent` generation (Phase 10) and matches
 * ADR-010's "append-only ledger merge, order-independent, no winner to
 * compute" — a rare multi-device race can leave a package's per-package
 * attribution slightly stale (e.g. a status flip to `depleted` landing a
 * beat late), but total stock (always a ledger-wide sum) is never wrong.
 */
import type { InventoryTransactionRecord, CreateInventoryTransactionInput } from "@/lib/domain/inventory-transaction";
import type { MedicationPackageRecord } from "@/lib/domain/medication-package";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";
import { WEEKDAY_BIT } from "@/lib/domain/medication-schedule";
import { uuidV5 } from "@/lib/domain/dose-event-generation";

/**
 * Distinct from `dose-event-generation.ts`'s own namespace — a different
 * entity's deterministic-id space, deliberately never reused, so no two
 * unrelated (namespace, name) derivations could ever collide even in
 * principle. Immutable once real data depends on it, same rule as that
 * namespace's own doc comment: changing this constant would derive a
 * different id for the same dose event than every previously-synced
 * `dose_taken` row, defeating `uq_inventory_txn_dose_taken_once`'s replay
 * protection on next generation.
 */
const DOSE_TAKEN_CONSUMPTION_NAMESPACE = "8b6e6b1a-2f3f-4b7e-8b9e-1f6a2f8e9c22";

/** Deterministic id for the `dose_taken` ledger transaction a given dose event produces — so a retried "mark taken" call is naturally idempotent at the repository layer, on top of `uq_inventory_txn_dose_taken_once`'s server-side backstop. */
export function deriveDoseTakenTransactionId(doseEventId: string): Promise<string> {
  return uuidV5(DOSE_TAKEN_CONSUMPTION_NAMESPACE, doseEventId);
}

/** Exact decimal arithmetic at NUMERIC(12,3) precision, via integer milli-units — same "avoid float drift" reasoning as `lib/domain/money.ts`'s integer cents, scaled for quantities instead of currency. */
const MILLI_SCALE = 1000;

function toMilliUnits(decimal: string): number {
  const value = Number(decimal);
  return Math.round(value * MILLI_SCALE);
}

function fromMilliUnits(milli: number): string {
  return (milli / MILLI_SCALE).toFixed(3).replace(/\.?0+$/, "") || "0";
}

/** Current stock for a medication — always the ledger-wide sum, never a stored counter (ADR-010). */
export function computeCurrentStockMilliUnits(transactions: readonly InventoryTransactionRecord[], userMedicationId: string): number {
  return transactions.filter((t) => t.userMedicationId === userMedicationId).reduce((sum, t) => sum + toMilliUnits(t.quantityDelta), 0);
}

export function computeCurrentStock(transactions: readonly InventoryTransactionRecord[], userMedicationId: string): string {
  return fromMilliUnits(computeCurrentStockMilliUnits(transactions, userMedicationId));
}

function remainingMilliUnitsForPackage(transactions: readonly InventoryTransactionRecord[], packageId: string): number {
  return transactions.filter((t) => t.packageId === packageId).reduce((sum, t) => sum + toMilliUnits(t.quantityDelta), 0);
}

/**
 * FIFO candidate selection: open, non-deleted packages for this medication
 * with remaining stock > 0, soonest expiry first (`NULLS LAST` — a known
 * deadline outranks an unknown one), then whichever was opened first, then
 * `id` for pure determinism on a true tie. Returns `null` when there's no
 * open package to attribute to (e.g. the user never explicitly tracked
 * one) — callers should NOT auto-open a package in that case; the
 * resulting transaction just carries `packageId: null` and still
 * decrements total stock correctly via the medication-wide sum.
 */
export function selectFifoPackageId(
  packages: readonly MedicationPackageRecord[],
  transactions: readonly InventoryTransactionRecord[],
  userMedicationId: string,
): string | null {
  const candidates = packages
    .filter((p) => p.userMedicationId === userMedicationId && p.status === "opened" && p.deletedAt === null)
    .map((p) => ({ pkg: p, remaining: remainingMilliUnitsForPackage(transactions, p.id) }))
    .filter((c) => c.remaining > 0)
    .sort((a, b) => {
      const expiryA = a.pkg.expiryDate ?? "9999-99-99";
      const expiryB = b.pkg.expiryDate ?? "9999-99-99";
      if (expiryA !== expiryB) return expiryA < expiryB ? -1 : 1;
      const openedA = a.pkg.openedAt ?? "";
      const openedB = b.pkg.openedAt ?? "";
      if (openedA !== openedB) return openedA < openedB ? -1 : 1;
      return a.pkg.id < b.pkg.id ? -1 : a.pkg.id > b.pkg.id ? 1 : 0;
    });

  return candidates[0]?.pkg.id ?? null;
}

export interface DoseConsumptionResult {
  transaction: CreateInventoryTransactionInput;
  /** Set when FIFO attribution drove the attributed package's remaining stock to zero or below — the caller must also persist this status flip (same local/sync transaction as the ledger row) so the next FIFO run naturally rolls over to the next package. */
  depletedPackageId: string | null;
}

/**
 * Builds the ledger row (and any resulting package-depleted flip) for a
 * dose being marked Taken. Never splits a dose across two packages — the
 * `uq_inventory_txn_dose_taken_once` constraint allows at most one
 * `dose_taken` row per dose event, so the FIFO-selected package is
 * attributed the FULL dose even if its remaining stock goes negative.
 */
export function buildDoseTakenConsumption(params: {
  id: string;
  clientMutationId: string;
  profileId: string;
  userMedicationId: string;
  doseEventId: string;
  quantityValue: string;
  quantityUnit: string;
  occurredAt: string;
  source: "user" | "system";
  packages: readonly MedicationPackageRecord[];
  transactions: readonly InventoryTransactionRecord[];
}): DoseConsumptionResult {
  const packageId = selectFifoPackageId(params.packages, params.transactions, params.userMedicationId);
  const deltaMilli = -toMilliUnits(params.quantityValue);

  const transaction: CreateInventoryTransactionInput = {
    id: params.id,
    profileId: params.profileId,
    userMedicationId: params.userMedicationId,
    packageId,
    transactionType: "dose_taken",
    quantityDelta: fromMilliUnits(deltaMilli),
    quantityUnit: params.quantityUnit,
    doseEventId: params.doseEventId,
    occurredAt: params.occurredAt,
    source: params.source,
    note: null,
    clientMutationId: params.clientMutationId,
  };

  if (packageId === null) {
    return { transaction, depletedPackageId: null };
  }

  const remainingBefore = remainingMilliUnitsForPackage(params.transactions, packageId);
  const remainingAfter = remainingBefore + deltaMilli;
  return { transaction, depletedPackageId: remainingAfter <= 0 ? packageId : null };
}

/**
 * Builds the offsetting ledger row for un-marking a dose as Taken. Copies
 * `packageId` verbatim from the original `dose_taken` row rather than
 * re-running FIFO — reversal must undo the specific package effect that
 * actually happened, or it can credit stock back to the wrong batch.
 * Returns `null` if no `dose_taken` row exists for this dose event (the
 * caller has nothing to reverse).
 */
export function buildDoseReversedConsumption(params: {
  id: string;
  clientMutationId: string;
  profileId: string;
  userMedicationId: string;
  doseEventId: string;
  occurredAt: string;
  source: "user" | "system";
  transactions: readonly InventoryTransactionRecord[];
}): CreateInventoryTransactionInput | null {
  const original = params.transactions.find((t) => t.doseEventId === params.doseEventId && t.transactionType === "dose_taken");
  if (!original) return null;

  return {
    id: params.id,
    profileId: params.profileId,
    userMedicationId: params.userMedicationId,
    packageId: original.packageId,
    transactionType: "dose_reversed",
    quantityDelta: fromMilliUnits(-toMilliUnits(original.quantityDelta)),
    quantityUnit: original.quantityUnit,
    doseEventId: params.doseEventId,
    occurredAt: params.occurredAt,
    source: params.source,
    note: null,
    clientMutationId: params.clientMutationId,
  };
}

/** How many doses/day an active, non-PRN schedule implies — averaged for `specific_weekdays` since it doesn't apply every day. `prn` and inactive schedules contribute nothing (excluded by the caller). */
export function scheduledOccurrencesPerDay(schedule: MedicationScheduleRecord): number {
  if (schedule.scheduleKind === "prn") return 0;
  if (schedule.scheduleKind === "every_n_hours") {
    return schedule.intervalHours ? 24 / schedule.intervalHours : 0;
  }
  const timesPerOccurrence = schedule.timesOfDay?.length ?? 0;
  if (schedule.scheduleKind === "specific_weekdays") {
    const mask = schedule.weekdaysMask ?? 0;
    const daysSet = Object.values(WEEKDAY_BIT).filter((bit) => (mask & (1 << bit)) !== 0).length;
    return timesPerOccurrence * (daysSet / 7);
  }
  return timesPerOccurrence; // daily, multiple_times_daily: every day
}

export type RefillProjectionBasis = "observed" | "scheduled" | "none";

export interface RefillProjection {
  currentStock: string;
  basis: RefillProjectionBasis;
  /** Doses (in the medication's own quantity unit) consumed per day, per `basis`. `null` when `basis === "none"`. */
  dailyRate: number | null;
  /** Whole days until stock reaches zero at `dailyRate`, floored (conservative — never overpromise). `null` when `basis === "none"`. */
  daysRemaining: number | null;
  /** "YYYY-MM-DD", local-date arithmetic only — `null` when `basis === "none"`. */
  projectedOutOfStockDate: string | null;
}

const OBSERVED_WINDOW_DAYS = 14;
const OBSERVED_MIN_DOSE_COUNT = 5;

/**
 * Prefers the OBSERVED consumption rate (trailing 14 days of real
 * `dose_taken` transactions) when there's enough history to be honest
 * about it (>= 5 doses) — more representative of real adherence than the
 * aspirational schedule, and the only option at all for a PRN medication.
 * Falls back to the SCHEDULED rate, then to no projection at all (raw
 * stock only) if neither is available. Never a medical recommendation
 * (CLAUDE.md rule 1) — `basis` lets the UI render the required "estimate,
 * not advice" framing correctly per Phase 3 UX risk R8.
 */
export function computeRefillProjection(
  userMedicationId: string,
  quantityUnit: string,
  transactions: readonly InventoryTransactionRecord[],
  schedules: readonly MedicationScheduleRecord[],
  now: Date = new Date(),
): RefillProjection {
  const currentStockMilli = computeCurrentStockMilliUnits(transactions, userMedicationId);
  const currentStock = fromMilliUnits(currentStockMilli);

  const windowStart = new Date(now.getTime() - OBSERVED_WINDOW_DAYS * 86_400_000).toISOString();
  const observedDoses = transactions.filter(
    (t) => t.userMedicationId === userMedicationId && t.transactionType === "dose_taken" && t.occurredAt >= windowStart,
  );
  const observedMilliPerDay = observedDoses.reduce((sum, t) => sum + Math.abs(toMilliUnits(t.quantityDelta)), 0) / OBSERVED_WINDOW_DAYS;

  const scheduledOccurrences = schedules
    .filter((s) => s.userMedicationId === userMedicationId && s.deletedAt === null && s.scheduleKind !== "prn")
    .reduce((sum, s) => sum + scheduledOccurrencesPerDay(s) * toMilliUnits(s.doseQuantityValue), 0);

  let basis: RefillProjectionBasis;
  let dailyRateMilli: number;
  if (observedDoses.length >= OBSERVED_MIN_DOSE_COUNT) {
    basis = "observed";
    dailyRateMilli = observedMilliPerDay;
  } else if (scheduledOccurrences > 0) {
    basis = "scheduled";
    dailyRateMilli = scheduledOccurrences;
  } else {
    return { currentStock, basis: "none", dailyRate: null, daysRemaining: null, projectedOutOfStockDate: null };
  }

  if (dailyRateMilli <= 0) {
    return { currentStock, basis: "none", dailyRate: null, daysRemaining: null, projectedOutOfStockDate: null };
  }

  const daysRemaining = Math.max(0, Math.floor(currentStockMilli / dailyRateMilli));
  const projectedDate = new Date(now.getTime() + daysRemaining * 86_400_000);

  return {
    currentStock,
    basis,
    dailyRate: dailyRateMilli / MILLI_SCALE,
    daysRemaining,
    projectedOutOfStockDate: projectedDate.toISOString().slice(0, 10),
  };
}

/** Independent of the projection above — a raw threshold crossing works even for a PRN medication with no rate at all (data-architect design: "keep independent, additive, not one replacing the other"). */
export function isBelowLowStockThreshold(currentStock: string, lowStockThresholdValue: string | null): boolean {
  if (lowStockThresholdValue === null) return false;
  return toMilliUnits(currentStock) < toMilliUnits(lowStockThresholdValue);
}

const RUNNING_LOW_HORIZON_DAYS = 7;

/** A softer, earlier advisory than the hard threshold — can fire before the threshold is literally crossed when the consumption rate says stock will run out soon regardless of the current count. */
export function isRunningLowSoon(projection: RefillProjection): boolean {
  return projection.daysRemaining !== null && projection.daysRemaining <= RUNNING_LOW_HORIZON_DAYS;
}
