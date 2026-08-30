"use client";

import { useState } from "react";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { useMedicationsList } from "@/components/medications/use-medications-list";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { useDoseEventsForDate } from "@/components/calendar/use-dose-events-for-date";
import { DateNavigator } from "@/components/calendar/DateNavigator";
import { DoseCard } from "@/components/today/DoseCard";

/**
 * Phase 3 §2.6 Calendar — day view only for this pass, not the full
 * month/day/timeline trio the spec describes (ux-accessibility-designer
 * design, 2026-08-30). Reason: dose-event generation
 * (`GENERATION_HORIZON_MS`, `lib/scheduling/client/dose-event-
 * generator.ts`) only materializes real rows 72h ahead of "now" — a
 * month grid would show ~27 empty days even for a medication that
 * genuinely has doses coming, which reads as broken, not "coming soon".
 * Day view has no such problem: today/near-future days are always real,
 * and past days are always real (adherence history is never deleted).
 * Widening the horizon or adding a read-only projection layer for future
 * month cells is a data-architect-owned tradeoff, not decided here.
 */
export default function CalendarPage() {
  const profileId = useProfileId();
  const [date, setDate] = useState(() => new Date());
  const { status: medsStatus, medications } = useMedicationsList(profileId);
  const names = useDisplayNames(medications);
  const { status: dosesStatus, doses } = useDoseEventsForDate(profileId, date);

  function shiftDay(deltaDays: number) {
    setDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + deltaDays);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Ημερολόγιο</h1>

      <DateNavigator date={date} onPrevDay={() => shiftDay(-1)} onNextDay={() => shiftDay(1)} onToday={() => setDate(new Date())} />

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
            <DoseCard
              key={dose.id}
              dose={dose}
              medicationName={names.get(dose.userMedicationId) ?? "…"}
              actionable={false}
              onTaken={() => {}}
              onSkipped={() => {}}
              onSnoozed={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}
