"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { useMedicationsList } from "@/components/medications/use-medications-list";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { useMedicationStrengths } from "@/lib/medications/client/use-medication-strengths";
import { useDoseEventsForRange } from "@/components/calendar/use-dose-events-for-range";
import { CalendarSegmentedNav } from "@/components/calendar/CalendarSegmentedNav";
import { DateNavigator } from "@/components/calendar/DateNavigator";
import { DoseCard } from "@/components/today/DoseCard";
import { ProjectedDoseRow } from "@/components/calendar/ProjectedDoseRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { dateToParam, paramToDate } from "@/components/calendar/date-param";

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function EmptyDayIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
      <path d="M3.5 9.5h17M8 3v3M16 3v3" />
    </svg>
  );
}

/**
 * Calendar day view (Phase 3 §2.6, ADR-014) — chronological, cross-
 * medication list for one selected day, mixing real `DoseCard`s (tappable,
 * a real `id` exists) with lighter `ProjectedDoseRow`s for anything beyond
 * the materialization horizon (never tappable — no `id` exists yet).
 *
 * Design pass (2026-09-27): this used to be split across two separate
 * views — Day (real doses only, via `useDoseEventsForDate`) and a third
 * "Χρονολόγιο"/Timeline tab that additionally showed projected doses. User
 * feedback on the redesign mockup: the two views looked almost identical
 * (one dashed row was the only visible difference) and read as "why does
 * this exist as a separate tab" rather than an obviously distinct view —
 * merged here, absorbing Timeline's real+projected chronological merge
 * into Day directly, and `CalendarSegmentedNav` dropped to two segments
 * (Μήνας/Ημέρα). `use-dose-events-for-date.ts` and the `/calendar/timeline`
 * route are now dead and were deleted rather than left as unused code.
 */
export default function CalendarPage() {
  const profileId = useProfileId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = paramToDate(searchParams.get("date"));
  const dateParam = dateToParam(date);
  const { status: medsStatus, medications } = useMedicationsList(profileId);
  const names = useDisplayNames(medications);
  const strengths = useMedicationStrengths(medications);
  const { status: dosesStatus, doses, projected } = useDoseEventsForRange(profileId, startOfLocalDay(date), endOfLocalDay(date));

  // Real and projected doses can share a single day right at the
  // materialization-horizon boundary — merge and sort chronologically
  // rather than rendering two separate blocks, so the day stays truly
  // chronological even on that boundary day.
  const dayItems = useMemo(() => {
    const items: ({ kind: "real"; scheduledAt: string } & { dose: (typeof doses)[number] })[] = doses
      .filter((d) => d.scheduledAt !== null)
      .map((dose) => ({ kind: "real" as const, scheduledAt: dose.scheduledAt!, dose }));
    const projectedItems = projected.map((instant) => ({ kind: "projected" as const, scheduledAt: instant.scheduledAt, instant }));
    return [...items, ...projectedItems].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [doses, projected]);

  function navigateToDate(next: Date) {
    router.replace(`/calendar?date=${dateToParam(next)}`);
  }

  function shiftDay(deltaDays: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + deltaDays);
    navigateToDate(next);
  }

  const isLoading = medsStatus === "loading" || dosesStatus === "loading";
  const isEmpty = dosesStatus === "ready" && doses.length === 0 && projected.length === 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Ημερολόγιο</h1>

      <CalendarSegmentedNav active="day" dateParam={dateParam} />

      <DateNavigator date={date} onPrevDay={() => shiftDay(-1)} onNextDay={() => shiftDay(1)} onToday={() => navigateToDate(new Date())} />

      {isLoading && (
        <p role="status" className="text-sm text-stone-600 dark:text-stone-400">
          Φόρτωση…
        </p>
      )}

      {isEmpty && <EmptyState icon={<EmptyDayIcon />} title="Δεν υπάρχουν δόσεις για αυτή την ημέρα" />}

      {dosesStatus === "ready" && dayItems.length > 0 && (
        <div className="flex flex-col gap-2" aria-label="Δόσεις ημέρας">
          {dayItems.map((item, i) =>
            item.kind === "real" ? (
              <Link key={item.dose.id} href={`/calendar/dose/${item.dose.id}`} className="block">
                <DoseCard
                  dose={item.dose}
                  medicationName={names.get(item.dose.userMedicationId) ?? "…"}
                  medicationStrength={strengths.get(item.dose.userMedicationId)}
                  actionable={false}
                  onTaken={() => {}}
                  onSkipped={() => {}}
                  onSnoozed={() => {}}
                />
              </Link>
            ) : (
              <ProjectedDoseRow key={`${item.instant.scheduleId}-${i}`} medicationName={names.get(item.instant.userMedicationId) ?? "…"} scheduledAt={item.instant.scheduledAt} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
