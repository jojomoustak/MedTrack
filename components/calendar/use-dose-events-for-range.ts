"use client";

import { useEffect, useState } from "react";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { GENERATION_HORIZON_MS } from "@/lib/scheduling/client/dose-event-generator";
import { projectDoseInstantsForRange, type ProjectedDoseInstant } from "@/lib/domain/dose-instant-projection";
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import { compareTimestampsAscending } from "@/lib/domain/timestamp";
import { onLocalDataHydrated } from "@/lib/sync/client/local-data-signal";
import { readSnapshot, refreshSnapshot } from "@/lib/client-cache/snapshot";

export interface DoseEventsForRangeState {
  status: "loading" | "ready";
  /** Real, materialized doses within `[from, to]` — `scheduledAt` ascending. Always real for "now and earlier," per `GENERATION_HORIZON_MS`. */
  doses: DoseEventRecord[];
  /** Everything beyond the materialization horizon `[from, to]` still covers — `scheduledAt` ascending. Never actionable (ADR-014: no `id`/`status` exists yet). */
  projected: ProjectedDoseInstant[];
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

/**
 * Calendar month/timeline views (Phase 3 §2.6, ADR-014) — the range
 * generalization of `useDoseEventsForDate`. Splits `[from, to]` at
 * `now + GENERATION_HORIZON_MS`: the real portion reads already-
 * materialized `DoseEventRecord`s exactly like the day view does; the
 * portion beyond the horizon is computed fresh on every load via
 * `projectDoseInstantsForRange`, never persisted, never actionable.
 */
export function useDoseEventsForRange(profileId: string | null, from: Date, to: Date): DoseEventsForRangeState {
  const fromKey = from.toDateString();
  const toKey = to.toDateString();
  // A month or day seen before draws at once from what it showed last time (`lib/client-cache/snapshot.ts`), then re-reads.
  const snapshotKey = `dose-range:${profileId}:${fromKey}:${toKey}`;
  const [state, setState] = useState<DoseEventsForRangeState>(
    () => (profileId ? readSnapshot<DoseEventsForRangeState>(snapshotKey) : undefined) ?? { status: "loading", doses: [], projected: [] },
  );
  // Another day picked: show it at once if it was seen before, rather than the previous day's list until the read lands.
  const [shownKey, setShownKey] = useState(snapshotKey);
  if (shownKey !== snapshotKey) {
    setShownKey(snapshotKey);
    const cached = readSnapshot<DoseEventsForRangeState>(snapshotKey);
    if (cached) setState(cached);
  }

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    async function load() {
      const doseEventRepo = new DexieDoseEventRepository();
      const scheduleRepo = new DexieMedicationScheduleRepository();
      const now = new Date();
      const horizonEnd = new Date(now.getTime() + GENERATION_HORIZON_MS);

      // Cancelled doses never happen (schedule changed / medication stopped) — not shown.
      const doses = (await doseEventRepo.listForProfileInRange(profileId!, startOfLocalDayIso(from), endOfLocalDayIso(to))).filter((d) => d.status !== "cancelled");
      doses.sort((a, b) => compareTimestampsAscending(a.scheduledAt ?? "", b.scheduledAt ?? ""));

      let projected: ProjectedDoseInstant[] = [];
      if (endOfLocalDayIso(to) > horizonEnd.toISOString()) {
        const schedules = await scheduleRepo.list(profileId!);
        const projectionStart = horizonEnd > from ? horizonEnd : from;
        projected = projectDoseInstantsForRange(schedules, projectionStart, to);
      }

      const settled = refreshSnapshot<DoseEventsForRangeState>(snapshotKey, { status: "ready", doses, projected });
      if (!cancelled) setState(settled);
    }

    void load();
    // Re-read when a server pull lands new data — otherwise a fresh install
    // or second device shows an empty calendar until the user navigates.
    const unsubscribe = onLocalDataHydrated(() => void load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fromKey`/`toKey` are the stable, comparable proxies for `from`/`to` (fresh Date objects every render would otherwise re-fire this effect every render).
  }, [profileId, fromKey, toKey]);

  return state;
}
