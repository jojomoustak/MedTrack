"use client";

import { useState } from "react";
import { zonedWallClockToUtc } from "@/lib/domain/dose-event-generation";

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
    onSubmit({ intervalHours: hours, anchorAt });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Κάθε πόσες ώρες</h2>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Κάθε πόσες ώρες;</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={24}
          value={intervalHours}
          onChange={(e) => setIntervalHours(e.target.value)}
          aria-label="Διάστημα σε ώρες"
          className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">Πρώτη δόση</legend>
        <div className="flex gap-2">
          <input
            type="date"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
            aria-label="Ημερομηνία πρώτης δόσης"
            className="min-h-12 flex-1 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            type="time"
            value={anchorTime}
            onChange={(e) => setAnchorTime(e.target.value)}
            aria-label="Ώρα πρώτης δόσης"
            className="min-h-12 flex-1 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Το διάστημα υπολογίζεται από την πρώτη δόση και δεν αλλάζει με την αλλαγή ώρας (π.χ. καλοκαιρινή/χειμερινή ώρα).
        </p>
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
