"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { useMedicationsList } from "@/components/medications/use-medications-list";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { useDoseEventsForDate } from "@/components/calendar/use-dose-events-for-date";
import { CalendarSegmentedNav } from "@/components/calendar/CalendarSegmentedNav";
import { DateNavigator } from "@/components/calendar/DateNavigator";
import { DoseCard } from "@/components/today/DoseCard";
import { dateToParam, paramToDate } from "@/components/calendar/date-param";

/**
 * Phase 3 §2.6 Calendar — day view, one of the three views behind
 * `CalendarSegmentedNav` (month/day/timeline; ADR-014 unblocked the other
 * two). Always the full set of REAL doses for the day — never provisional
 * — since dose-event generation (`GENERATION_HORIZON_MS`) always
 * materializes at least the near future, and past days are always real
 * (adherence history is never deleted).
 */
export default function CalendarPage() {
  const profileId = useProfileId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = paramToDate(searchParams.get("date"));
  const dateParam = dateToParam(date);
  const { status: medsStatus, medications } = useMedicationsList(profileId);
  const names = useDisplayNames(medications);
  const { status: dosesStatus, doses } = useDoseEventsForDate(profileId, date);

  function navigateToDate(next: Date) {
    router.replace(`/calendar?date=${dateToParam(next)}`);
  }

  function shiftDay(deltaDays: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + deltaDays);
    navigateToDate(next);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Ημερολόγιο</h1>

      <CalendarSegmentedNav active="day" dateParam={dateParam} />

      <DateNavigator date={date} onPrevDay={() => shiftDay(-1)} onNextDay={() => shiftDay(1)} onToday={() => navigateToDate(new Date())} />

      {(medsStatus === "loading" || dosesStatus === "loading") && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Φόρτωση…
        </p>
      )}

      {medsStatus === "ready" && dosesStatus === "ready" && doses.length === 0 && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Δεν υπάρχουν δόσεις για αυτή την ημέρα.</p>
      )}

      {dosesStatus === "ready" && doses.length > 0 && (
        <div className="flex flex-col gap-2" aria-label="Δόσεις ημέρας">
          {doses.map((dose) => (
            <Link key={dose.id} href={`/calendar/dose/${dose.id}`} className="block">
              <DoseCard
                dose={dose}
                medicationName={names.get(dose.userMedicationId) ?? "…"}
                actionable={false}
                onTaken={() => {}}
                onSkipped={() => {}}
                onSnoozed={() => {}}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
