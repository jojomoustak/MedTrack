"use client";

import { useState } from "react";
import { FORM_LABELS, FORM_OPTIONS } from "@/components/medications/DetailsStep";
import type { MedicationForm } from "@/lib/domain/user-medication";
import { Button } from "@/components/ui/Button";
import { playSound } from "@/lib/sound/client/play-sound";
import { FIELD_INPUT } from "@/components/ui/field-styles";

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
      <h2 className="text-[22px] font-bold tracking-tight text-stone-900 dark:text-stone-50">Όποτε χρειάζεται</h2>
      <p className="text-[15px] text-stone-600 dark:text-stone-400">Χωρίς σταθερό πρόγραμμα — καταγράφετε τη δόση όποτε τη χρειάζεστε.</p>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-2">
          <span className="text-[17px] font-semibold text-stone-800 dark:text-stone-200">Ποσότητα δόσης</span>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Ποσότητα δόσης"
            className={`${FIELD_INPUT} pr-4`}
          />
        </label>
        <label className="flex flex-1 flex-col gap-2">
          <span className="text-[17px] font-semibold text-stone-800 dark:text-stone-200">Μονάδα</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as MedicationForm)}
            aria-label="Μονάδα δόσης"
            className={`${FIELD_INPUT} pr-4`}
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
