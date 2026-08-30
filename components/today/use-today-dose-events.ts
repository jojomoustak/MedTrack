"use client";

import { useCallback, useEffect, useState } from "react";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import { isTerminalDoseEventStatus } from "@/lib/domain/dose-event";

export interface TodayDoseEventsState {
  status: "loading" | "ready";
  /** Today's dose events, `scheduledAt` ascending. */
  todayDoses: DoseEventRecord[];
  /** `missed` dose events from the last 3 days — shown in Today's "Χρειάζεται προσοχή" section (ux-accessibility-designer design, 2026-08-30). Oldest first. */
  needsAttention: DoseEventRecord[];
  refresh: () => void;
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

/** Today's dose timeline (Phase 3 §2.2) — local-first read, same `status: "loading"|"ready"` shape as `useMedicationsList`. */
export function useTodayDoseEvents(profileId: string | null): TodayDoseEventsState {
  const [state, setState] = useState<Omit<TodayDoseEventsState, "refresh">>({ status: "loading", todayDoses: [], needsAttention: [] });
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    async function load() {
      const repo = new DexieDoseEventRepository();
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 3_600_000);

      const [todayDoses, recentDoses] = await Promise.all([
        repo.listForProfileInRange(profileId!, startOfLocalDayIso(now), endOfLocalDayIso(now)),
        repo.listForProfileInRange(profileId!, threeDaysAgo.toISOString(), startOfLocalDayIso(now)),
      ]);
      if (cancelled) return;

      todayDoses.sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
      const needsAttention = recentDoses.filter((d) => d.status === "missed").sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));

      setState({ status: "ready", todayDoses, needsAttention });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId, nonce]);

  return { ...state, refresh };
}

/** Whether every one of today's dose cards has reached a terminal state — drives Today's "all done" banner. */
export function allTodayDosesResolved(todayDoses: DoseEventRecord[]): boolean {
  return todayDoses.length > 0 && todayDoses.every((d) => isTerminalDoseEventStatus(d.status));
}
