"use client";

import { useMemo } from "react";
import { useDoseEventsForRange } from "@/components/calendar/use-dose-events-for-range";
import type { DoseEventStatus } from "@/lib/domain/dose-event";
import type { DoseMarkerKind } from "@/components/calendar/DoseStatusGlyph";

export type DaySummaryKind = "empty" | "real" | "projected";

export interface DaySummary {
  kind: DaySummaryKind;
  /** Only set when `kind === "real"` — the single worst status present that day, per `STATUS_SEVERITY` below. */
  worstStatus: DoseEventStatus | null;
  doseCount: number;
}

/** Lower = more worth surfacing as the day's single representative marker when several statuses land on the same day. `missed` is the most concerning outcome this app tracks (Phase 0's Elena persona: "a missed... dose matters most"); `taken` is the fully-resolved-fine terminal state, least worth flagging. */
const STATUS_SEVERITY: Record<DoseEventStatus, number> = {
  missed: 0,
  skipped: 1,
  taken_late: 2,
  scheduled: 3,
  reminded: 3,
  snoozed: 3,
  cancelled: 4,
  taken: 5,
};

function worstOf(statuses: DoseEventStatus[]): DoseEventStatus {
  return statuses.reduce((worst, s) => (STATUS_SEVERITY[s] < STATUS_SEVERITY[worst] ? s : worst));
}

/** `date.toDateString()`-style local key — timezone-safe grouping, not a UTC slice. */
function localDayKey(iso: string): string {
  return new Date(iso).toDateString();
}

export interface DoseSummaryForMonthState {
  status: "loading" | "ready";
  /** Keyed by `Date.toDateString()` — one entry per day that has at least one real or projected dose. A day with no entry is `"empty"`. */
  byDay: Map<string, DaySummary>;
}

/**
 * Calendar month view (Phase 3 §2.6, ADR-014) — aggregates
 * `useDoseEventsForRange`'s real doses and projected instants into one
 * `DaySummary` per calendar day, so the month grid only has to look up a
 * day's marker rather than re-deriving it from a raw dose list itself.
 */
export function useDoseSummaryForMonth(profileId: string | null, monthDate: Date): DoseSummaryForMonthState {
  const from = useMemo(() => new Date(monthDate.getFullYear(), monthDate.getMonth(), 1), [monthDate]);
  const to = useMemo(() => new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999), [monthDate]);
  const { status, doses, projected } = useDoseEventsForRange(profileId, from, to);

  const byDay = useMemo(() => {
    const map = new Map<string, DaySummary>();

    for (const dose of doses) {
      if (dose.scheduledAt === null) continue;
      const key = localDayKey(dose.scheduledAt);
      const existing = map.get(key);
      if (!existing || existing.kind !== "real") {
        map.set(key, { kind: "real", worstStatus: dose.status, doseCount: 1 });
      } else {
        map.set(key, {
          kind: "real",
          worstStatus: worstOf([existing.worstStatus!, dose.status]),
          doseCount: existing.doseCount + 1,
        });
      }
    }

    for (const instant of projected) {
      const key = localDayKey(instant.scheduledAt);
      // A day with any real dose already stays "real" — projection only
      // fills in days the real materialization horizon hasn't reached yet.
      if (map.has(key)) continue;
      const existing = map.get(key);
      map.set(key, { kind: "projected", worstStatus: null, doseCount: (existing?.doseCount ?? 0) + 1 });
    }

    return map;
  }, [doses, projected]);

  return { status, byDay };
}

/** Marker kind for `DoseStatusGlyph` from a `DaySummary` — `"empty"` days render no marker at all (caller's own concern, not this function's). */
export function daySummaryToMarkerKind(summary: DaySummary): DoseMarkerKind | null {
  if (summary.kind === "projected") return "projected";
  if (summary.kind === "real" && summary.worstStatus) return summary.worstStatus;
  return null;
}
