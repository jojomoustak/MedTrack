"use client";

import { useEffect, useState } from "react";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { hydrateLocalDataFromServer } from "@/lib/sync/client/hydrate-local-data";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

export type MedicationsListStatus = "loading" | "ready";

export interface MedicationsListState {
  status: MedicationsListStatus;
  medications: UserMedicationRecord[];
}

/**
 * Local-first: reads whatever's already in Dexie immediately (works
 * offline, no spinner needed for the common case), then — best-effort,
 * in the background — pulls anything new from the server and refreshes.
 * Shared by the Today and Medications tabs, both of which need to know
 * "does this profile have any medications yet" (Today) or "show them all"
 * (Medications).
 */
export function useMedicationsList(profileId: string | null): MedicationsListState {
  const [state, setState] = useState<MedicationsListState>({ status: "loading", medications: [] });

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    const repo = new DexieUserMedicationRepository();

    async function load() {
      const local = await repo.list(profileId!);
      if (!cancelled) setState({ status: "ready", medications: local });

      await hydrateLocalDataFromServer({ userMedication: repo });
      if (cancelled) return;
      const refreshed = await repo.list(profileId!);
      if (!cancelled) setState({ status: "ready", medications: refreshed });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  return state;
}
