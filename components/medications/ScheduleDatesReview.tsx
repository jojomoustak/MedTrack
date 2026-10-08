"use client";

import { useState } from "react";
import { FORM_LABELS, FORM_OPTIONS } from "@/components/medications/DetailsStep";
import type { MedicationForm } from "@/lib/domain/user-medication";
import type { ScheduleDraft } from "@/lib/domain/schedule-draft";
import { Button } from "@/components/ui/Button";
import { playSound } from "@/lib/sound/client/play-sound";
import { FIELD_INPUT } from "@/components/ui/field-styles";

export interface ScheduleDatesReviewProps {
  /** Everything the schedule-kind-specific builder already collected — dose quantity included only when that builder (PRN) already asked for it. */
  base: Omit<ScheduleDraft, "startDate" | "endDate" | "timezone" | "doseQuantityValue" | "doseQuantityUnit"> & {
    doseQuantityValue?: string;
    doseQuantityUnit?: MedicationForm;
  };
  onSubmit: (draft: ScheduleDraft) => void;
  onBack: () => void;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Phase 3 §2.5's shared final step — start/end date, dose quantity (skipped if the PRN builder already collected it). */
export function ScheduleDatesReview({ base, onSubmit, onBack }: ScheduleDatesReviewProps) {
  const needsQuantity = base.doseQuantityValue === undefined;
  const [startDate, setStartDate] = useState(todayDateString());
  const [noEndDate, setNoEndDate] = useState(true);
  const [endDate, setEndDate] = useState("");
  const [quantityValue, setQuantityValue] = useState(base.doseQuantityValue ?? "1");
  const [quantityUnit, setQuantityUnit] = useState<MedicationForm>(base.doseQuantityUnit ?? "tablet");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!noEndDate && (!endDate || endDate < startDate)) {
      setError("Η ημερομηνία λήξης πρέπει να είναι μετά την ημερομηνία έναρξης.");
      return;
    }
    if (needsQuantity && !quantityValue.trim()) {
      setError("Συμπληρώστε την ποσότητα δόσης.");
      return;
    }
    setError(null);
    playSound("button");
    onSubmit({
      ...base,
      startDate,
      endDate: noEndDate ? null : endDate,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      doseQuantityValue: base.doseQuantityValue ?? quantityValue,
      doseQuantityUnit: base.doseQuantityUnit ?? quantityUnit,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-[22px] font-bold tracking-tight text-stone-900 dark:text-stone-50">Ημερομηνίες</h2>

      <label className="flex flex-col gap-1">
        <span className="text-[17px] font-semibold text-stone-800 dark:text-stone-200">Ημερομηνία έναρξης</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          aria-label="Ημερομηνία έναρξης"
          className={`${FIELD_INPUT} pr-4`}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[17px] font-semibold text-stone-800 dark:text-stone-200">Ημερομηνία λήξης</legend>
        <label className="flex min-h-12 items-center gap-2">
          <input type="checkbox" checked={noEndDate} onChange={(e) => setNoEndDate(e.target.checked)} className="size-5 accent-accent-700" />
          <span className="text-[17px] text-stone-800 dark:text-stone-200">Χωρίς ημερομηνία λήξης</span>
        </label>
        {!noEndDate && (
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="Ημερομηνία λήξης"
            className={`${FIELD_INPUT} pr-4`}
          />
        )}
      </fieldset>

      {needsQuantity && (
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-2">
            <span className="text-[17px] font-semibold text-stone-800 dark:text-stone-200">Ποσότητα δόσης</span>
            <input
              type="text"
              inputMode="decimal"
              value={quantityValue}
              onChange={(e) => setQuantityValue(e.target.value)}
              aria-label="Ποσότητα δόσης"
              className={`${FIELD_INPUT} pr-4`}
            />
          </label>
          <label className="flex flex-1 flex-col gap-2">
            <span className="text-[17px] font-semibold text-stone-800 dark:text-stone-200">Μονάδα</span>
            <select
              value={quantityUnit}
              onChange={(e) => setQuantityUnit(e.target.value as MedicationForm)}
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
      )}

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
