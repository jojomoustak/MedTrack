"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { useMedicationsList } from "@/components/medications/use-medications-list";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { useMedicationStrengths } from "@/lib/medications/client/use-medication-strengths";
import { useDoseEventsForRange } from "@/components/calendar/use-dose-events-for-range";
import { useDoseSummaryForMonth, daySummaryToMarkerKind, type DaySummary } from "@/components/calendar/use-dose-summary-for-month";
import { DoseStatusGlyph, DOSE_MARKER_LABEL } from "@/components/calendar/DoseStatusGlyph";
import { ChevronIcon } from "@/components/calendar/ChevronIcon";
import { ChevronIcon as RowChevron } from "@/components/ui/ChevronIcon";
import { ProjectedDoseRow } from "@/components/calendar/ProjectedDoseRow";
import { TodayDoseRow } from "@/components/today/TodayDoseRow";
import { dateToParam, paramToDate } from "@/components/calendar/date-param";
import { playSound } from "@/lib/sound/client/play-sound";

/** Monday-first, the way a Greek week reads. */
const WEEKDAY_HEADERS = ["Δευ", "Τρί", "Τετ", "Πέμ", "Παρ", "Σάβ", "Κυρ"];

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

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

/** The month's days, Monday-first, with `null` padding before the 1st so each weekday lines up under its header. */
function buildMonthCells(monthDate: Date): (Date | null)[] {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const cells: (Date | null)[] = Array.from({ length: leading }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), d));
  return cells;
}

/** Marker tint on an unselected day — the marker's shape already states the status; color only reinforces it. */
function markerTint(kind: string): string {
  if (kind === "missed") return "text-amber-600 dark:text-amber-400";
  if (kind === "taken" || kind === "taken_late") return "text-accent-600 dark:text-accent-400";
  return "text-stone-400 dark:text-stone-500";
}

function dayAriaLabel(date: Date, summary: DaySummary | undefined): string {
  const dateLabel = date.toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" });
  if (!summary) return `${dateLabel}, χωρίς δόσεις`;
  if (summary.kind === "projected") return `${dateLabel}, προγραμματισμένες δόσεις`;
  return `${dateLabel}, ${summary.doseCount} δόσεις, ${DOSE_MARKER_LABEL[summary.worstStatus!]}`;
}

/**
 * Calendar (Phase 3 §2.6, ADR-014), laid out after the reference mockup's
 * screen 17: a month grid — selected day solid green, a small status marker
 * under days with doses (shape, not color alone) — and the selected day's
 * doses listed beneath. The day's heading opens its timeline
 * (`/calendar/day`). Display only: doses are recorded from Today or a
 * dose's own screen, never by browsing another day here.
 */
export default function CalendarPage() {
  const profileId = useProfileId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = paramToDate(searchParams.get("date"));
  const dateParam = dateToParam(date);
  const today = useMemo(() => new Date(), []);

  const { byDay } = useDoseSummaryForMonth(profileId, date);
  const cells = useMemo(() => buildMonthCells(date), [date]);
  const monthLabel = date.toLocaleDateString("el-GR", { month: "long", year: "numeric" });

  const { medications } = useMedicationsList(profileId);
  const names = useDisplayNames(medications);
  const strengths = useMedicationStrengths(medications);
  const { status: dosesStatus, doses, projected } = useDoseEventsForRange(profileId, startOfLocalDay(date), endOfLocalDay(date));

  // Real and projected doses can share a day right at the materialization
  // horizon — one chronological list either way.
  const dayItems = useMemo(() => {
    const real = doses.filter((d) => d.scheduledAt !== null).map((dose) => ({ kind: "real" as const, scheduledAt: dose.scheduledAt!, dose }));
    const proj = projected.map((instant) => ({ kind: "projected" as const, scheduledAt: instant.scheduledAt, instant }));
    return [...real, ...proj].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [doses, projected]);

  function select(day: Date) {
    router.replace(`/calendar?date=${dateToParam(day)}`);
  }

  function shiftMonth(delta: number) {
    playSound("button");
    const next = new Date(date.getFullYear(), date.getMonth() + delta, 1);
    // Landing on the current month selects today, any other month its 1st.
    select(next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth() ? today : next);
  }

  const selectedLabel = date.toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-5 px-5 pt-1 pb-6">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Προηγούμενος μήνας"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-stone-700 active:scale-95 dark:text-stone-300"
        >
          <ChevronIcon direction="left" />
        </button>
        <h1 className="text-[22px] font-bold tracking-tight text-stone-900 capitalize dark:text-stone-50">{monthLabel}</h1>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Επόμενος μήνας"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-stone-700 active:scale-95 dark:text-stone-300"
        >
          <ChevronIcon direction="right" />
        </button>
      </div>

      <div>
        <div className="grid grid-cols-7 text-center text-[13px] font-medium text-stone-500 dark:text-stone-400" aria-hidden="true">
          {WEEKDAY_HEADERS.map((d) => (
            <span key={d} className="py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-y-1" role="grid" aria-label={monthLabel}>
          {cells.map((cellDate, i) => {
            if (!cellDate) return <span key={`pad-${i}`} aria-hidden="true" />;
            const summary = byDay.get(cellDate.toDateString());
            const markerKind = summary ? daySummaryToMarkerKind(summary) : null;
            const isSelected = isSameLocalDay(cellDate, date);
            const isToday = isSameLocalDay(cellDate, today);
            return (
              <button
                key={cellDate.toISOString()}
                type="button"
                aria-label={dayAriaLabel(cellDate, summary)}
                aria-current={isToday ? "date" : undefined}
                aria-pressed={isSelected}
                onClick={() => {
                  playSound("button");
                  select(cellDate);
                }}
                data-day-kind={summary?.kind ?? "empty"}
                className={`mx-auto flex h-12 w-11 flex-col items-center justify-center gap-0.5 rounded-xl text-base tabular-nums transition-colors ${
                  isSelected
                    ? "bg-accent-700 font-bold text-white dark:bg-accent-500 dark:text-stone-950"
                    : isToday
                      ? "font-bold text-accent-700 dark:text-accent-400"
                      : "text-stone-800 dark:text-stone-200"
                }`}
              >
                {cellDate.getDate()}
                {markerKind && <DoseStatusGlyph kind={markerKind} className={`h-2.5 w-2.5 ${isSelected ? "text-white dark:text-stone-950" : markerTint(markerKind)}`} />}
              </button>
            );
          })}
        </div>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="selected-day-heading">
        <Link
          href={`/calendar/day?date=${dateParam}`}
          onClick={() => playSound("button")}
          className="flex min-h-11 items-center justify-between gap-2"
        >
          <h2 id="selected-day-heading" className="text-[19px] font-bold text-stone-900 first-letter:uppercase dark:text-stone-50">
            {selectedLabel}
          </h2>
          <RowChevron />
        </Link>

        {dosesStatus === "loading" ? (
          <p role="status" className="text-sm text-stone-600 dark:text-stone-400">
            Φόρτωση…
          </p>
        ) : dayItems.length === 0 ? (
          <p className="text-[15px] text-stone-600 dark:text-stone-400">Καμία δόση αυτή την ημέρα.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {dayItems.map((item, i) =>
              item.kind === "real" ? (
                <TodayDoseRow
                  key={item.dose.id}
                  dose={item.dose}
                  medicationName={names.get(item.dose.userMedicationId) ?? "…"}
                  medicationStrength={strengths.get(item.dose.userMedicationId)}
                  onTake={() => {}}
                  readOnly
                />
              ) : (
                <ProjectedDoseRow
                  key={`${item.instant.scheduleId}-${i}`}
                  medicationName={names.get(item.instant.userMedicationId) ?? "…"}
                  scheduledAt={item.instant.scheduledAt}
                />
              ),
            )}
          </div>
        )}
      </section>
    </div>
  );
}
