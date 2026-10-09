"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { onLocalDataHydrated } from "@/lib/sync/client/local-data-signal";
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import { isTerminalDoseEventStatus } from "@/lib/domain/dose-event";
import { compareTimestampsAscending, isTimestampAtOrBefore } from "@/lib/domain/timestamp";
import { readSnapshot, refreshSnapshot } from "@/lib/client-cache/snapshot";

export interface TodayDoseEventsState {
  status: "loading" | "ready";
  /** Today's dose events, `scheduledAt` ascending. */
  todayDoses: DoseEventRecord[];
  refresh: () => void;
}

/** How often to re-check for a dose crossing into "due now" while Today stays mounted — independent of `refresh()`, which only fires after a user action. */
const DUE_CHECK_INTERVAL_MS = 30_000;

function todaySnapshotKey(profileId: string, now: Date): string {
  return `today-doses:${profileId}:${now.toDateString()}`;
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
 * Today's dose timeline (Phase 3 §2.2) — local-first read, same
 * `status: "loading"|"ready"` shape as `useMedicationsList`.
 *
 * `onNewlyDue`, when provided, fires once for each dose event that
 * crosses from "not yet due" to "due now" (still `scheduled`/`reminded`,
 * `scheduledAt` at or before the current instant) while this hook stays
 * mounted — the in-app "a dose just became due" chime's data source. A
 * periodic re-check (`DUE_CHECK_INTERVAL_MS`) drives this independent of
 * `refresh()`, since nothing else calls `refresh()` on its own just
 * because the clock advanced. Kept in a ref rather than the effect's own
 * dependency array so a fresh inline callback on every parent render
 * doesn't restart the interval each time.
 */
export function useTodayDoseEvents(profileId: string | null, onNewlyDue?: (dose: DoseEventRecord) => void): TodayDoseEventsState {
  // Back on Today: draw what it showed last time, then re-read (`lib/client-cache/snapshot.ts`). Keyed by day, so yesterday's list never stands in for today's.
  const [state, setState] = useState<Omit<TodayDoseEventsState, "refresh">>(() => {
    const cached = profileId ? readSnapshot<DoseEventRecord[]>(todaySnapshotKey(profileId, new Date())) : undefined;
    return cached ? { status: "ready", todayDoses: cached } : { status: "loading", todayDoses: [] };
  });
  const [nonce, setNonce] = useState(0);
  const onNewlyDueRef = useRef(onNewlyDue);
  const previouslyDueIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    onNewlyDueRef.current = onNewlyDue;
  }, [onNewlyDue]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    async function load() {
      const repo = new DexieDoseEventRepository();
      const now = new Date();
      // Today only. Missed doses from earlier days used to be listed above
      // today's ("Χρειάζεται προσοχή") and were removed at the user's request
      // (2026-10-09): with a few medications it was a wall of rows pushing
      // today's doses down. They stay in Calendar, whose dose screen still
      // records "taken later".
      const allTodayDoses = await repo.listForProfileInRange(profileId!, startOfLocalDayIso(now), endOfLocalDayIso(now));
      if (cancelled) return;
      // A cancelled dose never happens (its schedule was changed or the
      // medication stopped) — it isn't one of today's doses, and must not
      // count toward today's progress.
      const todayDoses = allTodayDoses.filter((d) => d.status !== "cancelled");

      todayDoses.sort((a, b) => compareTimestampsAscending(a.scheduledAt ?? "", b.scheduledAt ?? ""));

      const nowIso = now.toISOString();
      const currentlyDue = todayDoses.filter(
        (d) => (d.status === "scheduled" || d.status === "reminded") && d.scheduledAt !== null && isTimestampAtOrBefore(d.scheduledAt, nowIso),
      );
      const currentlyDueIds = new Set(currentlyDue.map((d) => d.id));
      // `previouslyDueIdsRef.current === null` means this is the first
      // load this mount -- every "due" dose found here was already due
      // before the page ever opened, so none of them should chime; only
      // a dose that becomes due WHILE the page stays open is "newly" due.
      if (onNewlyDueRef.current && previouslyDueIdsRef.current !== null) {
        for (const dose of currentlyDue) {
          if (!previouslyDueIdsRef.current.has(dose.id)) onNewlyDueRef.current(dose);
        }
      }
      previouslyDueIdsRef.current = currentlyDueIds;

      const settled = refreshSnapshot(todaySnapshotKey(profileId!, now), todayDoses);
      setState((prev) => (prev.status === "ready" && prev.todayDoses === settled ? prev : { status: "ready", todayDoses: settled }));
    }

    void load();
    const interval = setInterval(() => void load(), DUE_CHECK_INTERVAL_MS);
    // Re-read as soon as a server pull lands new data (fresh install, second
    // device) rather than waiting up to DUE_CHECK_INTERVAL_MS.
    const unsubscribe = onLocalDataHydrated(() => void load());
    return () => {
      cancelled = true;
      clearInterval(interval);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onNewlyDue is read via onNewlyDueRef precisely so it doesn't need to be a dependency here (see this function's doc comment).
  }, [profileId, nonce]);

  return { ...state, refresh };
}

/** Whether every one of today's dose cards has reached a terminal state — drives Today's "all done" banner. */
export function allTodayDosesResolved(todayDoses: DoseEventRecord[]): boolean {
  return todayDoses.length > 0 && todayDoses.every((d) => isTerminalDoseEventStatus(d.status));
}
