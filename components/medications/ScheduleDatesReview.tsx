"use client";

import { useState } from "react";
import { FORM_LABELS, FORM_OPTIONS } from "@/components/medications/DetailsStep";
import type { MedicationForm } from "@/lib/domain/user-medication";
import type { ScheduleDraft } from "@/lib/domain/schedule-draft";
import { Button } from "@/components/ui/Button";
import { DateField, daysBetween, longDate, parseLocalDate } from "@/components/ui/DateField";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { dateToParam } from "@/components/calendar/date-param";
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

/**
 * The end date read back in words, like the chosen weekdays a step before:
 * «Για 10 μέρες, ως και την Πέμπτη 29 Οκτωβρίου». Both days count.
 */
export function describeSpan(start: string, end: string, today = new Date()): string | null {
  const first = parseLocalDate(start);
  const last = parseLocalDate(end);
  if (!first || !last || daysBetween(first, last) < 0) return null;
  const days = daysBetween(first, last) + 1;
  // Σάββατο is the one weekday that isn't feminine.
  const article = last.getDay() === 6 ? "το" : "την";
  return `Για ${days} ${days === 1 ? "μέρα" : "μέρες"}, ως και ${article} ${longDate(last, today)}.`;
}

/** Phase 3 §2.5's shared final step — start/end date, dose quantity (skipped if the PRN builder already collected it). */
export function ScheduleDatesReview({ base, onSubmit, onBack }: ScheduleDatesReviewProps) {
  const needsQuantity = base.doseQuantityValue === undefined;
  // The phone's own date: `toISOString()` gave yesterday between midnight and 03:00 in Greece.
  const [startDate, setStartDate] = useState(() => dateToParam(new Date()));
  const [noEndDate, setNoEndDate] = useState(true);
  const [endDate, setEndDate] = useState("");
  const [quantityValue, setQuantityValue] = useState(base.doseQuantityValue ?? "1");
  const [quantityUnit, setQuantityUnit] = useState<MedicationForm>(base.doseQuantityUnit ?? "tablet");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!noEndDate && !endDate) {
      setError("Επιλέξτε την τελευταία μέρα.");
      return;
    }
    if (!noEndDate && endDate < startDate) {
      setError("Η τελευταία μέρα δεν μπορεί να είναι πριν από την πρώτη.");
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

  const span = noEndDate ? null : describeSpan(startDate, endDate);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-[22px] font-bold tracking-tight text-stone-900">Ημερομηνίες</h2>

      <fieldset className="flex flex-col">
        <legend className="mb-2.5 text-[17px] font-semibold text-stone-800">Από πότε;</legend>
        <DateField value={startDate} onChange={setStartDate} label="Πρώτη μέρα" />
      </fieldset>

      {/* «Ημερομηνία λήξης» until 2026-10-20 — on a medicine that reads as its expiry date. */}
      <fieldset className="mt-3 flex flex-col gap-3">
        <legend className="mb-2.5 text-[17px] font-semibold text-stone-800">Μέχρι πότε;</legend>
        <SegmentedControl
          label="Μέχρι πότε"
          segments={[
            { value: "open", label: "Μέχρι νεωτέρας" },
            { value: "until", label: "Μέχρι μια μέρα" },
          ]}
          value={noEndDate ? "open" : "until"}
          onChange={(choice) => {
            playSound("button");
            setNoEndDate(choice === "open");
          }}
        />
        {!noEndDate && (
          <>
            <DateField value={endDate} onChange={setEndDate} label="Τελευταία μέρα" min={startDate} rangeStart={startDate} initiallyOpen={!endDate} />
            {span && (
              <p aria-live="polite" className="text-[15px] font-medium leading-snug text-stone-700">
                {span}
              </p>
            )}
          </>
        )}
      </fieldset>

      {needsQuantity && (
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-2">
            <span className="text-[17px] font-semibold text-stone-800">Ποσότητα δόσης</span>
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
            <span className="text-[17px] font-semibold text-stone-800">Μονάδα</span>
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
        <p role="alert" className="text-[15px] font-medium text-red-700">
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
