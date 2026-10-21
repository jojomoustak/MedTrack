"use client";

import { useState } from "react";
import { ChevronIcon } from "@/components/calendar/ChevronIcon";
import { dateToParam } from "@/components/calendar/date-param";
import { playSound } from "@/lib/sound/client/play-sound";
import { useLanguage, useT, T } from "@/lib/i18n/client";
import { LOCALE_OF } from "@/lib/i18n/language";
import type { Translator } from "@/lib/i18n/translate";

/** Monday first, as on the Calendar screen. */
const WEEKDAY_HEADERS = ["Δευ", "Τρί", "Τετ", "Πέμ", "Παρ", "Σάβ", "Κυρ"];
const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" → local midnight, or null for anything else (an empty value included). */
export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) || dateToParam(date) !== value ? null : date;
}

/** Whole days from `from` to `to` (local dates; DST days count as one). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / DAY_MS);
}

/** «Τρίτη 20 Οκτωβρίου», with the year only when it isn't this one. */
export function longDate(date: Date, today = new Date(), locale = "el-GR"): string {
  return date.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

function relativeDay(date: Date, today: Date, t: Translator): string | null {
  const offset = daysBetween(today, date);
  if (offset === 0) return t("Σήμερα");
  if (offset === 1) return t("Αύριο");
  if (offset === -1) return t("Χθες");
  return null;
}

function monthCells(month: Date): (Date | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const cells: (Date | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  return cells;
}

/** A calendar page with the day on it: the date's own number at a glance. */
function CalendarPage({ day }: { day: number | null }) {
  return (
    <span className="flex size-11 shrink-0 flex-col overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgb(28_25_23/0.08),0_1px_6px_rgb(28_25_23/0.08)]">
      <span className="h-3 bg-accent-700" aria-hidden="true" />
      <span className={`flex flex-1 items-center justify-center text-[17px] font-bold tabular-nums leading-none ${day ? "text-stone-900" : "text-stone-300"}`}>
        {day ?? "–"}
      </span>
    </span>
  );
}

/**
 * A date (owner's request 2026-10-20, after the clock: «now the calendar in
 * the next step» — it was the phone's own date dialog). A row with the date
 * in words («Σήμερα», «Τρίτη 20 Οκτωβρίου»); tapping it opens the month
 * underneath in the Calendar screen's look. `min`/`max` grey out the days
 * outside them, and `rangeStart` tints the days from it to the chosen one
 * (an end date shows the whole stretch). `value` and `onChange` speak local
 * "YYYY-MM-DD", "" for none.
 */
export function DateField({
  value,
  onChange,
  label,
  min,
  max,
  rangeStart,
  initiallyOpen = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Names the date for screen readers ("Πρώτη μέρα"). */
  label: string;
  min?: string;
  max?: string;
  rangeStart?: string;
  /** Opens on the month at once, e.g. when the person has just asked to pick an end date. */
  initiallyOpen?: boolean;
}) {
  const t = useT();
  const language = useLanguage();
  const locale = LOCALE_OF[language];
  const today = new Date();
  const current = parseLocalDate(value);
  const minDate = min ? parseLocalDate(min) : null;
  const maxDate = max ? parseLocalDate(max) : null;
  const from = rangeStart ? parseLocalDate(rangeStart) : null;
  const [open, setOpen] = useState(initiallyOpen);
  const [month, setMonth] = useState(() => {
    const anchor = current ?? minDate ?? today;
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });

  function toggle() {
    playSound("button");
    if (!open) {
      const anchor = current ?? minDate ?? today;
      setMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    }
    setOpen((o) => !o);
  }

  const outside = (date: Date) => (minDate !== null && daysBetween(minDate, date) < 0) || (maxDate !== null && daysBetween(date, maxDate) < 0);
  const monthLabel = month.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const canGoBack = !minDate || month > new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const canGoOn = !maxDate || month < new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  const relative = current ? relativeDay(current, today, t) : null;

  return (
    <div className="surface-card overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={current ? `${label}: ${longDate(current, today, locale)}` : t("{label}: χωρίς ημερομηνία", { label })}
        className="flex min-h-18 w-full items-center gap-3.5 px-4 text-left"
      >
        <CalendarPage day={current ? current.getDate() : null} />
        {current ? (
          <span className="flex min-w-0 flex-col">
            {relative && <span className="text-[14px] font-semibold leading-tight text-accent-700">{relative}</span>}
            <span className="text-[19px] font-bold leading-snug tracking-tight text-stone-900 first-letter:uppercase">{longDate(current, today, locale)}</span>
          </span>
        ) : (
          <span className="text-[18px] font-semibold text-accent-700"><T>Επιλέξτε ημερομηνία</T></span>
        )}
        {current && !open && <span className="ml-auto pl-2 text-[15px] font-semibold text-accent-700"><T>Αλλαγή</T></span>}
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-stone-100 px-3 pt-3 pb-4">
          <div className="flex items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={() => {
                playSound("button");
                setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
              }}
              disabled={!canGoBack}
              aria-label={t("Προηγούμενος μήνας")}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-stone-700 active:scale-95 disabled:opacity-35"
            >
              <ChevronIcon direction="left" />
            </button>
            <p className="text-[18px] font-bold tracking-tight text-stone-900 capitalize" aria-live="polite">
              {monthLabel}
            </p>
            <button
              type="button"
              onClick={() => {
                playSound("button");
                setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
              }}
              disabled={!canGoOn}
              aria-label={t("Επόμενος μήνας")}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-stone-700 active:scale-95 disabled:opacity-35"
            >
              <ChevronIcon direction="right" />
            </button>
          </div>

          <div>
            <div className="grid grid-cols-7 text-center text-[13px] font-medium text-stone-500" aria-hidden="true">
              {WEEKDAY_HEADERS.map((d) => (
                <span key={d} className="py-1">
                  {t(d)}
                </span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-y-1" role="group" aria-label={monthLabel}>
              {monthCells(month).map((cell, i) => {
                if (!cell) return <span key={`pad-${i}`} aria-hidden="true" />;
                const selected = current !== null && daysBetween(cell, current) === 0;
                const isToday = daysBetween(cell, today) === 0;
                const disabled = outside(cell);
                const inRange = from !== null && current !== null && daysBetween(from, cell) >= 0 && daysBetween(cell, current) > 0;
                return (
                  <button
                    key={cell.getDate()}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={isToday ? t("{date}, σήμερα", { date: longDate(cell, today, locale) }) : longDate(cell, today, locale)}
                    onClick={() => {
                      playSound("button");
                      onChange(dateToParam(cell));
                    }}
                    className={`mx-auto flex h-11 w-11 items-center justify-center rounded-xl text-base tabular-nums transition-colors duration-150 ${
                      selected
                        ? "bg-accent-700 font-bold text-white"
                        : disabled
                          ? "text-stone-300"
                          : inRange
                            ? "bg-accent-50 font-semibold text-accent-800"
                            : isToday
                              ? "font-bold text-accent-700 ring-1 ring-accent-600/40"
                              : "text-stone-800 active:bg-stone-100"
                    }`}
                  >
                    {cell.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              playSound("button");
              setOpen(false);
            }}
            className="mx-1 min-h-12 rounded-xl bg-accent-700 text-[17px] font-semibold text-white transition-transform active:scale-[0.98]"
          >
            <T>Έτοιμο</T>
          </button>
        </div>
      )}
    </div>
  );
}
