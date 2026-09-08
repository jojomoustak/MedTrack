"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { CalendarSegmentedNav } from "@/components/calendar/CalendarSegmentedNav";
import { dateToParam, paramToDate } from "@/components/calendar/date-param";
import { useDoseSummaryForMonth, daySummaryToMarkerKind, type DaySummary } from "@/components/calendar/use-dose-summary-for-month";
import { DoseStatusGlyph, DOSE_MARKER_LABEL, type DoseMarkerKind } from "@/components/calendar/DoseStatusGlyph";
import { playSound } from "@/lib/sound/client/play-sound";

const WEEKDAY_INITIALS = ["Κυ", "Δε", "Τρ", "Τε", "Πε", "Πα", "Σα"];
const LEGEND_KINDS: DoseMarkerKind[] = ["missed", "taken", "projected"];

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Every cell the grid renders — includes the leading/trailing days of adjacent months so the grid is always a clean multiple of 7, matching a standard month calendar. */
function buildGridDays(monthDate: Date): { date: Date; inMonth: boolean }[] {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startWeekday = firstOfMonth.getDay();
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - startWeekday);

  const days: { date: Date; inMonth: boolean }[] = [];
  const cursor = new Date(gridStart);
  for (let i = 0; i < 42; i++) {
    days.push({ date: new Date(cursor), inMonth: cursor.getMonth() === monthDate.getMonth() });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function buildDayAriaLabel(date: Date, summary: DaySummary | undefined): string {
  const dateLabel = date.toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" });
  if (!summary) return `${dateLabel}, χωρίς δόσεις`;
  if (summary.kind === "projected") return `${dateLabel}, προγραμματισμένες δόσεις, χωρίς κατάσταση ακόμα`;
  return `${dateLabel}, ${summary.doseCount} δόσεις, ${DOSE_MARKER_LABEL[summary.worstStatus!]}`;
}

/** Calendar month view (Phase 3 §2.6, ADR-014) — status-at-a-glance per day via `DoseStatusGlyph`'s non-color-only markers; tapping a day jumps to Day view for that date, never straight to a dose's own detail. */
export default function CalendarMonthPage() {
  const profileId = useProfileId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = paramToDate(searchParams.get("date"));
  const dateParam = dateToParam(date);
  const today = useMemo(() => new Date(), []);

  const { status, byDay } = useDoseSummaryForMonth(profileId, date);
  const gridDays = useMemo(() => buildGridDays(date), [date]);
  const monthLabel = date.toLocaleDateString("el-GR", { month: "long", year: "numeric" });

  function shiftMonth(deltaMonths: number) {
    const next = new Date(date);
    next.setMonth(next.getMonth() + deltaMonths, 1);
    router.replace(`/calendar/month?date=${dateToParam(next)}`);
  }

  function goToDay(day: Date) {
    playSound("button");
    router.push(`/calendar?date=${dateToParam(day)}`);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Ημερολόγιο</h1>

      <CalendarSegmentedNav active="month" dateParam={dateParam} />

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            playSound("button");
            shiftMonth(-1);
          }}
          aria-label="Προηγούμενος μήνας"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-lg dark:border-zinc-700"
        >
          ‹
        </button>
        <p className="font-medium capitalize">{monthLabel}</p>
        <button
          type="button"
          onClick={() => {
            playSound("button");
            shiftMonth(1);
          }}
          aria-label="Επόμενος μήνας"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-lg dark:border-zinc-700"
        >
          ›
        </button>
      </div>

      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        {LEGEND_KINDS.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1">
            <DoseStatusGlyph kind={kind} className="h-3 w-3" />
            {DOSE_MARKER_LABEL[kind]}
          </span>
        ))}
      </p>

      {status === "loading" && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Φόρτωση…
        </p>
      )}

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-500 dark:text-zinc-500" aria-hidden="true">
        {WEEKDAY_INITIALS.map((initial, i) => (
          <span key={i}>{initial}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={monthLabel}>
        {gridDays.map(({ date: cellDate, inMonth }) => {
          const summary = byDay.get(cellDate.toDateString());
          const markerKind = summary ? daySummaryToMarkerKind(summary) : null;
          const isToday = isSameLocalDay(cellDate, today);
          const isSelected = isSameLocalDay(cellDate, date);

          return (
            <button
              key={cellDate.toISOString()}
              type="button"
              aria-label={buildDayAriaLabel(cellDate, summary)}
              aria-current={isToday ? "date" : undefined}
              onClick={() => goToDay(cellDate)}
              data-day-kind={summary?.kind ?? "empty"}
              className={`flex min-h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-lg border p-1 text-sm ${
                inMonth ? "border-zinc-200 dark:border-zinc-800" : "border-transparent opacity-40"
              } ${isSelected ? "border-2 border-zinc-900 dark:border-zinc-50" : ""}`}
            >
              <span>{cellDate.getDate()}</span>
              {markerKind && <DoseStatusGlyph kind={markerKind} className="h-4 w-4" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
