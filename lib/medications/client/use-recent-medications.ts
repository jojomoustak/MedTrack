"use client";

import { useEffect, useState } from "react";
import { DexieRecentlyUsedEventRepository } from "@/lib/db-client/recently-used-event-repository";

export interface RecentMedicationsState {
  status: "loading" | "ready";
  /** Most-recently-interacted-with first, deduped to one entry per medication (the raw event log can have many events per medication — this collapses to "when did I last touch this one"). */
  recentMedicationIds: string[];
}

/** How many raw events to scan before collapsing to per-medication recency — generous enough to cover "recently used" for a realistic number of active medications without loading the whole (unboundedly-growing, Phase 2 §2.11) table. */
const EVENT_SCAN_LIMIT = 200;

/** Backs the Medications list's "Recent" segment (Phase 3 §1 refinement 1). */
export function useRecentMedications(profileId: string | null): RecentMedicationsState {
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [recentMedicationIds, setRecentMedicationIds] = useState<string[]>([]);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    async function load() {
      const repo = new DexieRecentlyUsedEventRepository();
      const events = await repo.listRecent(profileId!, EVENT_SCAN_LIMIT);
      if (cancelled) return;

      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const event of events) {
        if (seen.has(event.userMedicationId)) continue;
        seen.add(event.userMedicationId);
        ordered.push(event.userMedicationId);
      }
      setRecentMedicationIds(ordered);
      setStatus("ready");
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  return { status, recentMedicationIds };
}
