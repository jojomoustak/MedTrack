"use client";

import { useEffect, useMemo, useState } from "react";
import { readSnapshot, refreshSnapshot } from "@/lib/client-cache/snapshot";
import { DexieInventoryTransactionRepository } from "@/lib/db-client/inventory-transaction-repository";
import { computeCurrentStock, isBelowLowStockThreshold } from "@/lib/domain/inventory-consumption";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

/**
 * Which of `medications` are currently below their own
 * `lowStockThresholdValue` — one bulk `listForProfile` read (not N
 * per-medication reads) for the Medications list's row badge (Journey 5:
 * "same non-color low-stock cue everywhere... Medications list (badge on
 * the row)").
 */
export function useLowStockMedicationIds(profileId: string, medications: UserMedicationRecord[]): Set<string> {
  // Starts from what it showed last time (`lib/client-cache/snapshot.ts`), so the low-stock banner doesn't appear a moment after the screen.
  const snapshotKey = `low-stock:${profileId}`;
  const [ids, setIds] = useState<string[]>(() => readSnapshot<string[]>(snapshotKey) ?? []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const transactions = await new DexieInventoryTransactionRepository().listForProfile(profileId);
      if (cancelled) return;
      const below = new Set<string>();
      for (const med of medications) {
        if (!med.lowStockThresholdValue) continue;
        const stock = computeCurrentStock(transactions, med.id);
        if (isBelowLowStockThreshold(stock, med.lowStockThresholdValue)) below.add(med.id);
      }
      const settled = refreshSnapshot(snapshotKey, [...below].sort());
      setIds(settled);
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the joined id:threshold string is the stable, comparable proxy for `medications` (a fresh array reference every render would otherwise re-fire this effect every render).
  }, [profileId, medications.map((m) => `${m.id}:${m.lowStockThresholdValue}`).join(",")]);

  return useMemo(() => new Set(ids), [ids]);
}
