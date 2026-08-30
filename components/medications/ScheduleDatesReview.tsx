"use client";

import { useState } from "react";
import { FORM_LABELS, FORM_OPTIONS } from "@/components/medications/DetailsStep";
import type { MedicationForm } from "@/lib/domain/user-medication";
import type { ScheduleDraft } from "@/lib/domain/schedule-draft";

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
      <h2 className="text-lg font-semibold">Ημερομηνίες</h2>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Ημερομηνία έναρξης</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          aria-label="Ημερομηνία έναρξης"
          className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">Ημερομηνία λήξης</legend>
        <label className="flex min-h-12 items-center gap-2">
          <input type="checkbox" checked={noEndDate} onChange={(e) => setNoEndDate(e.target.checked)} className="h-5 w-5" />
          <span>Χωρίς ημερομηνία λήξης</span>
        </label>
        {!noEndDate && (
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="Ημερομηνία λήξης"
            className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        )}
      </fieldset>

      {needsQuantity && (
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="font-medium">Ποσότητα δόσης</span>
            <input
              type="text"
              inputMode="decimal"
              value={quantityValue}
              onChange={(e) => setQuantityValue(e.target.value)}
              aria-label="Ποσότητα δόσης"
              className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="font-medium">Μονάδα</span>
            <select
              value={quantityUnit}
              onChange={(e) => setQuantityUnit(e.target.value as MedicationForm)}
              aria-label="Μονάδα δόσης"
              className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
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
