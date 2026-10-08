"use client";

import { useState } from "react";
import { WEEKDAY_BIT } from "@/lib/domain/medication-schedule";
import { ALL_WEEKDAYS_MASK } from "@/lib/domain/schedule-draft";
import { Button } from "@/components/ui/Button";
import { playSound } from "@/lib/sound/client/play-sound";
import { FIELD_INPUT } from "@/components/ui/field-styles";

export interface WallClockScheduleValues {
  timesOfDay: string[];
  weekdaysMask: number | null;
}

export interface WallClockScheduleBuilderProps {
  onSubmit: (values: WallClockScheduleValues) => void;
  onBack: () => void;
  initial?: WallClockScheduleValues;
}

const WEEKDAYS: { bit: number; abbr: string; full: string }[] = [
  { bit: WEEKDAY_BIT.sunday, abbr: "Κυ", full: "Κυριακή" },
  { bit: WEEKDAY_BIT.monday, abbr: "Δε", full: "Δευτέρα" },
  { bit: WEEKDAY_BIT.tuesday, abbr: "Τρ", full: "Τρίτη" },
  { bit: WEEKDAY_BIT.wednesday, abbr: "Τε", full: "Τετάρτη" },
  { bit: WEEKDAY_BIT.thursday, abbr: "Πε", full: "Πέμπτη" },
  { bit: WEEKDAY_BIT.friday, abbr: "Πα", full: "Παρασκευή" },
  { bit: WEEKDAY_BIT.saturday, abbr: "Σα", full: "Σάββατο" },
];

/** Phase 3 §2.5's "Wall-clock builder" — covers daily/multiple_times_daily/specific_weekdays; `scheduleKind` itself is derived from these values (`deriveWallClockScheduleKind`), never chosen here. */
export function WallClockScheduleBuilder({ onSubmit, onBack, initial }: WallClockScheduleBuilderProps) {
  const [times, setTimes] = useState<string[]>(initial?.timesOfDay && initial.timesOfDay.length > 0 ? initial.timesOfDay : [""]);
  const [specificDays, setSpecificDays] = useState(initial?.weekdaysMask !== null && initial?.weekdaysMask !== undefined);
  const [selectedDays, setSelectedDays] = useState<number>(initial?.weekdaysMask ?? 0);
  const [error, setError] = useState<string | null>(null);

  function updateTime(index: number, value: string) {
    setTimes((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function addTimeRow() {
    playSound("button");
    setTimes((prev) => [...prev, ""]);
  }

  function removeTimeRow(index: number) {
    playSound("button");
    setTimes((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleDay(bit: number) {
    playSound("button");
    setSelectedDays((prev) => (prev & (1 << bit) ? prev & ~(1 << bit) : prev | (1 << bit)));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const filledTimes = times.map((t) => t.trim()).filter(Boolean);
    if (filledTimes.length === 0) {
      setError("Προσθέστε τουλάχιστον μία ώρα.");
      return;
    }
    if (specificDays && selectedDays === 0) {
      setError("Επιλέξτε τουλάχιστον μία ημέρα.");
      return;
    }
    // Selecting every day normalizes to "no specific days" (weekdaysMask: null).
    const weekdaysMask = specificDays && selectedDays !== ALL_WEEKDAYS_MASK ? selectedDays : null;
    setError(null);
    playSound("button");
    onSubmit({ timesOfDay: filledTimes, weekdaysMask });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-[22px] font-bold tracking-tight text-stone-900 dark:text-stone-50">Σταθερές ώρες</h2>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[17px] font-semibold text-stone-800 dark:text-stone-200">Ώρες δόσης</legend>
        {times.map((time, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="time"
              value={time}
              onChange={(e) => updateTime(index, e.target.value)}
              aria-label={`Ώρα δόσης ${index + 1}`}
              className={`${FIELD_INPUT} flex-1 pr-4`}
            />
            {times.length > 1 && (
              <button
                type="button"
                onClick={() => removeTimeRow(index)}
                aria-label={`Αφαίρεση ώρας ${index + 1}`}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-muted text-stone-600 dark:text-stone-300"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addTimeRow}
          className="inline-flex min-h-11 items-center gap-1.5 self-start text-[17px] font-semibold text-accent-700 dark:text-accent-400"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M10 4v12M4 10h12" strokeLinecap="round" />
          </svg>
          Προσθήκη ώρας
        </button>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[17px] font-semibold text-stone-800 dark:text-stone-200">Ποιες ημέρες;</legend>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { playSound("button"); setSpecificDays(false); }}
            aria-pressed={!specificDays}
            className={`min-h-12 flex-1 rounded-xl px-4 py-2 text-[15px] font-semibold ${
              !specificDays ? "bg-accent-700 text-white dark:bg-accent-500 dark:text-stone-950" : "bg-surface-muted text-stone-700 dark:text-stone-300"
            }`}
          >
            Κάθε μέρα
          </button>
          <button
            type="button"
            onClick={() => { playSound("button"); setSpecificDays(true); }}
            aria-pressed={specificDays}
            className={`min-h-12 flex-1 rounded-xl px-4 py-2 text-[15px] font-semibold ${
              specificDays ? "bg-accent-700 text-white dark:bg-accent-500 dark:text-stone-950" : "bg-surface-muted text-stone-700 dark:text-stone-300"
            }`}
          >
            Συγκεκριμένες ημέρες
          </button>
        </div>

        {specificDays && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Ημέρες">
            {WEEKDAYS.map(({ bit, abbr, full }) => {
              const checked = (selectedDays & (1 << bit)) !== 0;
              return (
                <button
                  key={bit}
                  type="button"
                  onClick={() => toggleDay(bit)}
                  aria-pressed={checked}
                  aria-label={full}
                  className={`flex h-12 w-12 items-center justify-center rounded-full text-[15px] font-semibold ${
                    checked ? "bg-accent-700 text-white dark:bg-accent-500 dark:text-stone-950" : "bg-surface-muted text-stone-700 dark:text-stone-300"
                  }`}
                >
                  {abbr}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="text-[15px] font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => { playSound("button"); onBack(); }} size="lg" className="flex-1">
          Πίσω
        </Button>
        <Button type="submit" size="lg" className="flex-1">
          Συνέχεια
        </Button>
      </div>
    </form>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  );
}
