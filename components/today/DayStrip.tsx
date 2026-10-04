"use client";

import { useRouter } from "next/navigation";
import { dateToParam } from "@/components/calendar/date-param";
import { playSound } from "@/lib/sound/client/play-sound";

const DAYS_SHOWN = 5;

function upcomingDays(today: Date): Date[] {
  return Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
}

/** "Δευ", "Τρί" — el-GR's short weekday, without the trailing period some engines add. */
function shortWeekday(day: Date): string {
  return day.toLocaleDateString("el-GR", { weekday: "short" }).replace(/\.$/, "");
}

/**
 * Today's day cards (reference mockup, screen 1): today plus the next four
 * days. Today itself only ever shows TODAY's doses — Calendar's day view
 * is where any other day lives — so tapping another day opens Calendar on
 * that date rather than re-fetching a different day into this page.
 */
export function DayStrip({ today }: { today: Date }) {
  const router = useRouter();
  const days = upcomingDays(today);

  return (
    <div className="grid grid-cols-5 gap-2" role="group" aria-label="Επόμενες ημέρες">
      {days.map((day, i) => {
        const isToday = i === 0;
        const label = day.toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" });
        return (
          <button
            key={day.toISOString()}
            type="button"
            aria-current={isToday ? "date" : undefined}
            aria-label={isToday ? `Σήμερα, ${label}` : label}
            disabled={isToday}
            onClick={() => {
              playSound("button");
              router.push(`/calendar?date=${dateToParam(day)}`);
            }}
            className={`flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl transition-transform duration-150 ${
              isToday
                ? "bg-accent-800 text-white shadow-[0_6px_14px_-6px_rgba(6,95,70,.55)] dark:bg-accent-600"
                : "bg-white text-stone-800 shadow-[0_1px_2px_rgba(28,25,23,.04),0_2px_8px_rgba(28,25,23,.06)] active:scale-95 dark:border dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100 dark:shadow-none"
            }`}
          >
            <span aria-hidden="true" className={`text-[15px] font-medium ${isToday ? "text-white/85" : "text-stone-500 dark:text-stone-400"}`}>
              {shortWeekday(day)}
            </span>
            <span aria-hidden="true" className="text-[22px] leading-none font-bold tabular-nums">
              {day.getDate()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
