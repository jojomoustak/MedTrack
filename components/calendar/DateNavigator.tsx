"use client";

export interface DateNavigatorProps {
  date: Date;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Phase 3 §2.6's day-view date navigator — no month-grid jump control this pass (ux-accessibility-designer design, 2026-08-30: deferred alongside month view, see Calendar page's own doc). */
export function DateNavigator({ date, onPrevDay, onNextDay, onToday }: DateNavigatorProps) {
  const isToday = isSameLocalDay(date, new Date());
  const label = date.toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onPrevDay}
        aria-label="Προηγούμενη ημέρα"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-lg dark:border-zinc-700"
      >
        ‹
      </button>
      <div className="flex flex-col items-center">
        <p className="font-medium capitalize">{label}</p>
        {!isToday && (
          <button type="button" onClick={onToday} className="min-h-12 text-sm font-medium underline">
            Σήμερα
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onNextDay}
        aria-label="Επόμενη ημέρα"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-lg dark:border-zinc-700"
      >
        ›
      </button>
    </div>
  );
}
