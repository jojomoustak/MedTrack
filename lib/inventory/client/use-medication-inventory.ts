"use client";

import { useCallback, useEffect, useState } from "react";
import { DexieMedicationPackageRepository } from "@/lib/db-client/medication-package-repository";
import { DexieInventoryTransactionRepository } from "@/lib/db-client/inventory-transaction-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { computeCurrentStock, computeRefillProjection, isBelowLowStockThreshold, isRunningLowSoon, type RefillProjection } from "@/lib/domain/inventory-consumption";
import type { MedicationPackageRecord } from "@/lib/domain/medication-package";
import type { InventoryTransactionRecord } from "@/lib/domain/inventory-transaction";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";

export interface MedicationInventoryState {
  status: "loading" | "ready";
  packages: MedicationPackageRecord[];
  transactions: InventoryTransactionRecord[];
  currentStock: string;
  projection: RefillProjection;
  belowThreshold: boolean;
  runningLowSoon: boolean;
  refresh: () => void;
}

interface LoadedData {
  packages: MedicationPackageRecord[];
  transactions: InventoryTransactionRecord[];
  schedules: MedicationScheduleRecord[];
}

/**
 * Local-first inventory read for one medication (Phase 9) — same
 * `status: "loading"|"ready"` + `refresh()` shape as `useTodayDoseEvents`/
 * `useMedicationsList`. Composes `lib/domain/inventory-consumption.ts`'s
 * pure functions over whatever's already in Dexie; never calls the
 * network itself (the sync manager/hydration pass already keeps these
 * tables current, per `designing-offline-sync`).
 */
export function useMedicationInventory(userMedicationId: string, lowStockThresholdValue: string | null): MedicationInventoryState {
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [data, setData] = useState<LoadedData>({ packages: [], transactions: [], schedules: [] });
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const packageRepo = new DexieMedicationPackageRepository();
      const transactionRepo = new DexieInventoryTransactionRepository();
      const scheduleRepo = new DexieMedicationScheduleRepository();
      const [packages, transactions, schedules] = await Promise.all([
        packageRepo.listByUserMedication(userMedicationId),
        transactionRepo.listByUserMedication(userMedicationId),
        scheduleRepo.listByUserMedication(userMedicationId),
      ]);
      if (cancelled) return;
      setData({ packages, transactions, schedules });
      setStatus("ready");
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [userMedicationId, nonce]);

  const currentStock = computeCurrentStock(data.transactions, userMedicationId);
  const projection = computeRefillProjection(userMedicationId, data.transactions, data.schedules);
  const belowThreshold = isBelowLowStockThreshold(currentStock, lowStockThresholdValue);
  const runningLowSoon = isRunningLowSoon(projection);

  return { status, packages: data.packages, transactions: data.transactions, currentStock, projection, belowThreshold, runningLowSoon, refresh };
}
