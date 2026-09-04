/**
 * Wires a dose being marked Taken to the inventory ledger (Phase 9,
 * ADR-010) — the actual functional integration point for
 * `lib/domain/inventory-consumption.ts`'s FIFO attribution. Best-effort:
 * a failure here must never undo or block the dose-event transition
 * itself (already committed by the time this runs) — inventory
 * bookkeeping is real but not safety-critical (CLAUDE.md priority order:
 * data integrity of the dose record outranks the ledger's accuracy).
 */
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import type { InventoryTransactionRepository, MedicationPackageRepository } from "@/lib/domain/repositories";
import { buildDoseTakenConsumption, deriveDoseTakenTransactionId } from "@/lib/domain/inventory-consumption";
import { newId } from "@/lib/domain/ids";
import { logger } from "@/lib/logging/logger";

export interface ConsumeDoseDeps {
  medicationPackages: MedicationPackageRepository;
  inventoryTransactions: InventoryTransactionRepository;
}

/**
 * No-op (never touches the ledger) when the dose carries no quantity —
 * e.g. a PRN dose logged with no quantity specified. Safe to call
 * repeatedly for the same dose event: `createIfMissing` is idempotent by
 * id (`buildDoseTakenConsumption`'s `id` is deterministic per dose event —
 * see below), so a retried transition can never double-consume stock.
 */
export async function consumeInventoryForDoseTaken(dose: DoseEventRecord, deps: ConsumeDoseDeps): Promise<void> {
  if (!dose.quantityValue || !dose.quantityUnit) return;

  try {
    const [packages, transactions] = await Promise.all([
      deps.medicationPackages.listByUserMedication(dose.userMedicationId),
      deps.inventoryTransactions.listByUserMedication(dose.userMedicationId),
    ]);

    const id = await deriveDoseTakenTransactionId(dose.id);
    const result = buildDoseTakenConsumption({
      id,
      clientMutationId: newId(),
      profileId: dose.profileId,
      userMedicationId: dose.userMedicationId,
      doseEventId: dose.id,
      quantityValue: dose.quantityValue,
      quantityUnit: dose.quantityUnit,
      occurredAt: dose.takenAt ?? new Date().toISOString(),
      source: "user",
      packages,
      transactions,
    });

    await deps.inventoryTransactions.createIfMissing(result.transaction);

    if (result.depletedPackageId) {
      const depletedPackage = packages.find((p) => p.id === result.depletedPackageId);
      if (depletedPackage) {
        await deps.medicationPackages.update(result.depletedPackageId, { status: "depleted" }, newId());
      }
    }
  } catch (err) {
    logger.warn("inventory.consume_dose_failed", { doseEventId: dose.id, message: err instanceof Error ? err.message : String(err) });
  }
}
