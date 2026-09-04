"use client";

import { useState } from "react";
import type { MedicationPackageRecord, MedicationPackageStatus } from "@/lib/domain/medication-package";
import type { InventoryTransactionRecord } from "@/lib/domain/inventory-transaction";
import { computePackageRemainingStock } from "@/lib/domain/inventory-consumption";
import { DexieMedicationPackageRepository } from "@/lib/db-client/medication-package-repository";
import { DexieInventoryTransactionRepository } from "@/lib/db-client/inventory-transaction-repository";
import { newId } from "@/lib/domain/ids";
import { FORM_LABELS } from "@/components/medications/DetailsStep";
import type { MedicationForm } from "@/lib/domain/user-medication";

const STATUS_LABELS: Record<MedicationPackageStatus, string> = {
  unopened: "Κλειστό",
  opened: "Ανοιγμένο",
  depleted: "Εξαντλημένο",
  discarded: "Απορρίφθηκε",
  expired: "Έληξε",
};

function unitLabel(unit: string): string {
  return FORM_LABELS[unit as MedicationForm] ?? unit;
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Package list within medication detail (Phase 3 §2.5) — batch, expiry,
 * status, derived quantity-remaining. Sorted soonest-expiry-first, same
 * order the FIFO consumption logic itself uses
 * (`lib/domain/inventory-consumption.ts`'s `selectFifoPackageId`), so
 * "which package will be used next" matches what's visually first here.
 * Actions are the only two real state transitions a package goes through
 * by hand — "Άνοιγμα" (open) and "Απόρριψη" (discard); `depleted` is
 * system-driven (FIFO consumption flips it, never a user tap) and
 * `expired` is a future housekeeping sweep, neither is a button here.
 */
export function PackageList({
  profileId,
  packages,
  transactions,
  onChanged,
}: {
  profileId: string;
  packages: MedicationPackageRecord[];
  transactions: InventoryTransactionRecord[];
  onChanged: () => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  const sorted = [...packages].sort((a, b) => {
    const expiryA = a.expiryDate ?? "9999-99-99";
    const expiryB = b.expiryDate ?? "9999-99-99";
    return expiryA < expiryB ? -1 : expiryA > expiryB ? 1 : 0;
  });

  async function handleOpen(pkg: MedicationPackageRecord) {
    setPendingId(pkg.id);
    try {
      const now = new Date().toISOString();
      const packageRepo = new DexieMedicationPackageRepository();
      await packageRepo.update(pkg.id, { status: "opened", openedAt: now }, newId());
      // Establishes this package's starting ledger balance -- without
      // this, `selectFifoPackageId` would never find it (its computed
      // "remaining" stays 0, the same as a genuinely empty package),
      // since a package's remaining is always derived from transactions
      // attributed to it, never from `initialQuantityValue` directly
      // (ADR-010's own example: "+30 package opened").
      const transactionRepo = new DexieInventoryTransactionRepository();
      await transactionRepo.createIfMissing({
        id: newId(),
        clientMutationId: newId(),
        profileId,
        userMedicationId: pkg.userMedicationId,
        packageId: pkg.id,
        transactionType: "package_opened",
        quantityDelta: pkg.initialQuantityValue,
        quantityUnit: pkg.quantityUnit,
        doseEventId: null,
        occurredAt: now,
        source: "user",
        note: null,
      });
      onChanged();
    } finally {
      setPendingId(null);
    }
  }

  async function handleDiscard(pkg: MedicationPackageRecord) {
    setPendingId(pkg.id);
    try {
      const repo = new DexieMedicationPackageRepository();
      await repo.update(pkg.id, { status: "discarded" }, newId());
      onChanged();
    } finally {
      setPendingId(null);
    }
  }

  if (sorted.length === 0) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">Δεν έχετε προσθέσει ακόμα κάποια συσκευασία.</p>;
  }

  return (
    <ul className="flex flex-col gap-2" aria-label="Συσκευασίες">
      {sorted.map((pkg) => (
        <li key={pkg.id} className="flex flex-col gap-1 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <p className="font-medium">
              {computePackageRemainingStock(transactions, pkg.id)} / {pkg.initialQuantityValue} {unitLabel(pkg.quantityUnit)}
            </p>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-500">{STATUS_LABELS[pkg.status]}</span>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {pkg.batchNumber ? `Παρτίδα ${pkg.batchNumber}` : "Χωρίς αριθμό παρτίδας"}
            {pkg.expiryDate ? ` · Λήξη ${formatDate(pkg.expiryDate)}` : " · Χωρίς ημερομηνία λήξης"}
          </p>
          {pkg.status === "unopened" && (
            <button
              type="button"
              onClick={() => void handleOpen(pkg)}
              disabled={pendingId === pkg.id}
              className="min-h-12 self-start rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-60 dark:border-zinc-700"
            >
              Άνοιγμα
            </button>
          )}
          {pkg.status === "opened" && (
            <button
              type="button"
              onClick={() => void handleDiscard(pkg)}
              disabled={pendingId === pkg.id}
              className="min-h-12 self-start rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-60 dark:border-zinc-700"
            >
              Απόρριψη
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
