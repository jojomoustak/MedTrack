"use client";

import { useState } from "react";
import { FORM_LABELS, FORM_OPTIONS } from "@/components/medications/DetailsStep";
import type { MedicationForm } from "@/lib/domain/user-medication";
import { Button } from "@/components/ui/Button";
import { playSound } from "@/lib/sound/client/play-sound";

export interface PrnScheduleValues {
  doseQuantityValue: string;
  doseQuantityUnit: MedicationForm;
}

export interface PrnScheduleBuilderProps {
  onSubmit: (values: PrnScheduleValues) => void;
  onBack: () => void;
  initial?: PrnScheduleValues;
}

/** Phase 3 §2.5's "PRN setup" — no fixed times, dose quantity only. There's no reminder/threshold column on `MedicationSchedule` to hold anything further here. */
export function PrnScheduleBuilder({ onSubmit, onBack, initial }: PrnScheduleBuilderProps) {
  const [value, setValue] = useState(initial?.doseQuantityValue ?? "1");
  const [unit, setUnit] = useState<MedicationForm>(initial?.doseQuantityUnit ?? "tablet");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim()) {
      setError("Συμπληρώστε την ποσότητα δόσης.");
      return;
    }
    setError(null);
    playSound("button");
    onSubmit({ doseQuantityValue: value, doseQuantityUnit: unit });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Όποτε χρειάζεται</h2>
      <p className="text-sm text-stone-600 dark:text-stone-400">Χωρίς σταθερό πρόγραμμα — καταγράφετε τη δόση όποτε τη χρειάζεστε.</p>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-medium">Ποσότητα δόσης</span>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Ποσότητα δόσης"
            className="min-h-12 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-medium">Μονάδα</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as MedicationForm)}
            aria-label="Μονάδα δόσης"
            className="min-h-12 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
          >
            {FORM_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {FORM_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
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
          className="flex-1"
        >
          Πίσω
        </Button>
        <Button type="submit" className="flex-1">
          Συνέχεια
        </Button>
      </div>
    </form>
  );
}
