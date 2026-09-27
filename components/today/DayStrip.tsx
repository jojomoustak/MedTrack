"use client";

import { useRouter } from "next/navigation";
import { dateToParam } from "@/components/calendar/date-param";
import { playSound } from "@/lib/sound/client/play-sound";

// Matches CalendarMonthPage's own convention exactly (same two-letter
// abbreviations), rather than inventing a second one for this strip.
const WEEKDAY_INITIALS = ["Κυ", "Δε", "Τρ", "Τε", "Πε", "Πα", "Σα"];

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function currentWeek(today: Date): Date[] {
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/**
 * Today's own week-at-a-glance strip (rebrand direction contract's FIRST
 * VIEWPORT). Today itself only ever shows TODAY's doses (that's the whole
 * point of the route — Calendar's day view is where any other day lives),
 * so tapping a non-today day here navigates to Calendar's day view for
 * that date rather than trying to re-fetch a different day's doses into
 * this page — no new data-fetching contract invented just for this strip.
 */
export function DayStrip({ today }: { today: Date }) {
  const router = useRouter();
  const days = currentWeek(today);

  return (
    <div className="flex justify-between gap-1" role="group" aria-label="Ημέρες της εβδομάδας">
      {days.map((day) => {
        const isToday = isSameLocalDay(day, today);
        const label = day.toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" });
        return (
          <button
            key={day.toISOString()}
            type="button"
            aria-current={isToday ? "date" : undefined}
            aria-label={label}
            disabled={isToday}
            onClick={() => {
              playSound("button");
              router.push(`/calendar?date=${dateToParam(day)}`);
            }}
            className={`flex flex-1 flex-col items-center gap-1 rounded-2xl py-1.5 text-xs font-medium transition-colors ${
              isToday ? "bg-white text-accent-800" : "text-white/70 active:bg-white/10"
            }`}
          >
            <span aria-hidden="true">{WEEKDAY_INITIALS[day.getDay()]}</span>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold tabular-nums ${isToday ? "" : ""}`}>{day.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
}
