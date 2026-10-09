"use client";

import { useEffect, useMemo, useState } from "react";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { onLocalDataHydrated } from "@/lib/sync/client/local-data-signal";
import { readSnapshot, refreshSnapshot } from "@/lib/client-cache/snapshot";
import { summarizeSchedules } from "@/lib/medications/schedule-summary";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Each medication's schedule summary ("2 φορές την ημέρα"), read from local storage — works offline. */
export function useScheduleSummaries(profileId: string, medications: UserMedicationRecord[]): Map<string, string | null> {
  // Starts from what it showed last time (`lib/client-cache/snapshot.ts`) — entries, not a Map, so an unchanged re-read compares equal.
  const snapshotKey = `schedule-summaries:${profileId}`;
  const [entries, setEntries] = useState<[string, string | null][]>(() => readSnapshot<[string, string | null][]>(snapshotKey) ?? []);
  const [nonce, setNonce] = useState(0);

  useEffect(() => onLocalDataHydrated(() => setNonce((n) => n + 1)), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const schedules = await new DexieMedicationScheduleRepository().list(profileId);
      const byMedication = new Map<string, MedicationScheduleRecord[]>();
      for (const s of schedules) {
        const list = byMedication.get(s.userMedicationId) ?? [];
        list.push(s);
        byMedication.set(s.userMedicationId, list);
      }
      const today = localToday();
      const map = new Map<string, string | null>();
      for (const med of medications) map.set(med.id, summarizeSchedules(byMedication.get(med.id) ?? [], today));
      const settled = refreshSnapshot(snapshotKey, [...map.entries()]);
      if (!cancelled) setEntries(settled);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId, medications, nonce, snapshotKey]);

  return useMemo(() => new Map(entries), [entries]);
}
