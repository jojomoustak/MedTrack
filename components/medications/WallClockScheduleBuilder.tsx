"use client";

import { useState } from "react";
import { WEEKDAY_BIT } from "@/lib/domain/medication-schedule";
import { ALL_WEEKDAYS_MASK } from "@/lib/domain/schedule-draft";

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
    setTimes((prev) => [...prev, ""]);
  }

  function removeTimeRow(index: number) {
    setTimes((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleDay(bit: number) {
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
    onSubmit({ timesOfDay: filledTimes, weekdaysMask });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Σταθερές ώρες</h2>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">Ώρες δόσης</legend>
        {times.map((time, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="time"
              value={time}
              onChange={(e) => updateTime(index, e.target.value)}
              aria-label={`Ώρα δόσης ${index + 1}`}
              className="min-h-12 flex-1 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
            {times.length > 1 && (
              <button
                type="button"
                onClick={() => removeTimeRow(index)}
                aria-label={`Αφαίρεση ώρας ${index + 1}`}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-lg dark:border-zinc-700"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addTimeRow}
          className="min-h-12 self-start rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          + Προσθήκη ώρας
        </button>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">Ποιες ημέρες;</legend>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSpecificDays(false)}
            aria-pressed={!specificDays}
            className={`min-h-12 flex-1 rounded-full border px-4 py-2 text-sm font-medium ${
              !specificDays ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            Κάθε μέρα
          </button>
          <button
            type="button"
            onClick={() => setSpecificDays(true)}
            aria-pressed={specificDays}
            className={`min-h-12 flex-1 rounded-full border px-4 py-2 text-sm font-medium ${
              specificDays ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"
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
                  className={`flex h-12 w-12 items-center justify-center rounded-full border text-sm font-medium ${
                    checked ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"
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
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="min-h-12 flex-1 rounded-full border border-zinc-300 px-5 py-3 font-medium dark:border-zinc-700">
          Πίσω
        </button>
        <button type="submit" className="min-h-12 flex-1 rounded-full bg-zinc-900 px-5 py-3 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900">
          Συνέχεια
        </button>
      </div>
    </form>
  );
}
