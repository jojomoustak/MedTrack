"use client";

import { useEffect, useState } from "react";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import type { DoseEventRecord } from "@/lib/domain/dose-event";

export interface DoseEventsForDateState {
  status: "loading" | "ready";
  doses: DoseEventRecord[];
}

function startOfLocalDayIso(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfLocalDayIso(date: Date): string {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/** Calendar day view (Phase 3 §2.6) — day-view-only for this pass (see Calendar page's doc for why month/timeline views are deferred). Read-only always, per the "actions only on today's own cards" rule. */
export function useDoseEventsForDate(profileId: string | null, date: Date): DoseEventsForDateState {
  const [state, setState] = useState<DoseEventsForDateState>({ status: "loading", doses: [] });
  const dateKey = date.toDateString();

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    async function load() {
      const repo = new DexieDoseEventRepository();
      const doses = await repo.listForProfileInRange(profileId!, startOfLocalDayIso(date), endOfLocalDayIso(date));
      doses.sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
      if (!cancelled) setState({ status: "ready", doses });
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `dateKey` is the stable, comparable proxy for `date` (a fresh Date object every render would otherwise re-fire this effect every render).
  }, [profileId, dateKey]);

  return state;
}
