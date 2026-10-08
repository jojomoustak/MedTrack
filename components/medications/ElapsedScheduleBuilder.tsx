"use client";

import { useState } from "react";
import { zonedWallClockToUtc } from "@/lib/domain/dose-event-generation";
import { Button } from "@/components/ui/Button";
import { playSound } from "@/lib/sound/client/play-sound";
import { FIELD_INPUT } from "@/components/ui/field-styles";

export interface ElapsedScheduleValues {
  intervalHours: number;
  anchorAt: string;
}

export interface ElapsedScheduleBuilderProps {
  onSubmit: (values: ElapsedScheduleValues) => void;
  onBack: () => void;
  initial?: { intervalHours: number; anchorDate: string; anchorTime: string };
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Phase 3 §2.5's "Elapsed builder" — every_n_hours: interval + first-dose anchor. */
export function ElapsedScheduleBuilder({ onSubmit, onBack, initial }: ElapsedScheduleBuilderProps) {
  const [intervalHours, setIntervalHours] = useState(initial?.intervalHours ? String(initial.intervalHours) : "8");
  const [anchorDate, setAnchorDate] = useState(initial?.anchorDate ?? todayDateString());
  const [anchorTime, setAnchorTime] = useState(initial?.anchorTime ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const hours = Number(intervalHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
      setError("Το διάστημα πρέπει να είναι από 1 έως 24 ώρες.");
      return;
    }
    if (!anchorDate || !anchorTime) {
      setError("Συμπληρώστε την ημερομηνία και ώρα της πρώτης δόσης.");
      return;
    }
    setError(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const anchorAt = zonedWallClockToUtc(anchorDate, anchorTime, timezone).toISOString();
    playSound("button");
    onSubmit({ intervalHours: hours, anchorAt });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-[22px] font-bold tracking-tight text-stone-900 dark:text-stone-50">Κάθε πόσες ώρες</h2>

      <label className="flex flex-col gap-1">
        <span className="text-[17px] font-semibold text-stone-800 dark:text-stone-200">Κάθε πόσες ώρες;</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={24}
          value={intervalHours}
          onChange={(e) => setIntervalHours(e.target.value)}
          aria-label="Διάστημα σε ώρες"
          className={`${FIELD_INPUT} pr-4`}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[17px] font-semibold text-stone-800 dark:text-stone-200">Πρώτη δόση</legend>
        <div className="flex gap-2">
          <input
            type="date"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
            aria-label="Ημερομηνία πρώτης δόσης"
            className={`${FIELD_INPUT} flex-1 pr-4`}
          />
          <input
            type="time"
            value={anchorTime}
            onChange={(e) => setAnchorTime(e.target.value)}
            aria-label="Ώρα πρώτης δόσης"
            className={`${FIELD_INPUT} flex-1 pr-4`}
          />
        </div>
        <p className="text-[15px] text-stone-600 dark:text-stone-400">
          Το διάστημα υπολογίζεται από την πρώτη δόση και δεν αλλάζει με την αλλαγή ώρας (π.χ. καλοκαιρινή/χειμερινή ώρα).
        </p>
      </fieldset>

      {error && (
        <p role="alert" className="text-[15px] font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            playSound("button");
            onBack();
          }}
          size="lg"
          className="flex-1"
        >
          Πίσω
        </Button>
        <Button type="submit" size="lg" className="flex-1">
          Συνέχεια
        </Button>
      </div>
    </form>
  );
}
