"use client";

import { useState } from "react";
import { WEEKDAY_BIT } from "@/lib/domain/medication-schedule";
import { ALL_WEEKDAYS_MASK } from "@/lib/domain/schedule-draft";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { playSound } from "@/lib/sound/client/play-sound";
import { TimeField } from "@/components/ui/TimeField";

export interface WallClockScheduleValues {
  timesOfDay: string[];
  weekdaysMask: number | null;
}

export interface WallClockScheduleBuilderProps {
  onSubmit: (values: WallClockScheduleValues) => void;
  onBack: () => void;
  initial?: WallClockScheduleValues;
}

/** Monday first, the way a Greek week reads. */
const WEEKDAYS: { bit: number; abbr: string; full: string }[] = [
  { bit: WEEKDAY_BIT.monday, abbr: "Δε", full: "Δευτέρα" },
  { bit: WEEKDAY_BIT.tuesday, abbr: "Τρ", full: "Τρίτη" },
  { bit: WEEKDAY_BIT.wednesday, abbr: "Τε", full: "Τετάρτη" },
  { bit: WEEKDAY_BIT.thursday, abbr: "Πε", full: "Πέμπτη" },
  { bit: WEEKDAY_BIT.friday, abbr: "Πα", full: "Παρασκευή" },
  { bit: WEEKDAY_BIT.saturday, abbr: "Σα", full: "Σάββατο" },
  { bit: WEEKDAY_BIT.sunday, abbr: "Κυ", full: "Κυριακή" },
];

const WEEKDAYS_ONLY = WEEKDAYS.slice(0, 5).reduce((mask, { bit }) => mask | (1 << bit), 0);
const WEEKEND_ONLY = WEEKDAYS.slice(5).reduce((mask, { bit }) => mask | (1 << bit), 0);

/** The chosen days read back in words under the circles, so a two-letter «Τε» or «Πε» slip shows. */
export function describeDays(mask: number): string {
  if (mask === 0) return "Πατήστε τις μέρες που χρειάζεστε.";
  if (mask === ALL_WEEKDAYS_MASK) return "Κάθε μέρα";
  if (mask === WEEKDAYS_ONLY) return "Δευτέρα έως Παρασκευή";
  if (mask === WEEKEND_ONLY) return "Κάθε Σάββατο και Κυριακή";
  const names = WEEKDAYS.filter(({ bit }) => mask & (1 << bit)).map(({ full }) => full);
  return `Κάθε ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} και ${names[names.length - 1]}`}`;
}

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
      <h2 className="text-[22px] font-bold tracking-tight text-stone-900">Σταθερές ώρες</h2>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-[17px] font-semibold text-stone-800">Ποιες ώρες;</legend>
        {times.map((time, index) => (
          <TimeField
            key={index}
            value={time}
            onChange={(value) => updateTime(index, value)}
            label={`Ώρα δόσης ${index + 1}`}
            suggestion={index === 0 ? "08:00" : "20:00"}
            trailing={
              times.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeTimeRow(index)}
                  aria-label={`Αφαίρεση ώρας ${index + 1}`}
                  className="flex size-12 shrink-0 items-center justify-center rounded-full text-stone-500 active:bg-stone-100"
                >
                  <CloseIcon />
                </button>
              ) : undefined
            }
          />
        ))}
        <button
          type="button"
          onClick={addTimeRow}
          className="inline-flex min-h-11 items-center gap-1.5 self-start text-[17px] font-semibold text-accent-700"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M10 4v12M4 10h12" strokeLinecap="round" />
          </svg>
          Προσθήκη ώρας
        </button>
      </fieldset>

      <fieldset className="mt-3 flex flex-col gap-3">
        <legend className="mb-2.5 text-[17px] font-semibold text-stone-800">Ποιες μέρες;</legend>
        <SegmentedControl
          label="Ποιες μέρες"
          segments={[
            { value: "every", label: "Κάθε μέρα" },
            { value: "some", label: "Ορισμένες μέρες" },
          ]}
          value={specificDays ? "some" : "every"}
          onChange={(choice) => {
            playSound("button");
            setSpecificDays(choice === "some");
          }}
        />

        {specificDays && (
          <div className="flex flex-col gap-3 pt-1">
            <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Ημέρες" aria-describedby="chosen-days">
              {WEEKDAYS.map(({ bit, abbr, full }) => {
                const checked = (selectedDays & (1 << bit)) !== 0;
                return (
                  <button
                    key={bit}
                    type="button"
                    onClick={() => toggleDay(bit)}
                    aria-pressed={checked}
                    aria-label={full}
                    className={`flex aspect-square w-full max-w-12 items-center justify-center justify-self-center rounded-full text-[15px] font-semibold transition duration-150 active:scale-90 ${
                      checked
                        ? "bg-accent-700 text-white shadow-[0_2px_6px_rgb(4_120_87/0.3)]"
                        : "bg-white text-stone-700 shadow-[0_1px_2px_rgb(28_25_23/0.05),0_2px_6px_rgb(28_25_23/0.07)]"
                    }`}
                  >
                    {abbr}
                  </button>
                );
              })}
            </div>
            <p id="chosen-days" aria-live="polite" className={`text-[15px] leading-snug ${selectedDays ? "font-medium text-stone-700" : "text-stone-500"}`}>
              {describeDays(selectedDays)}
            </p>
          </div>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="text-[15px] font-medium text-red-700">
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
