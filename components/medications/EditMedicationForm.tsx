"use client";

import { useState } from "react";
import { FORM_LABELS, FORM_OPTIONS } from "@/components/medications/DetailsStep";
import { FIELD_INPUT, FIELD_LABEL, FIELD_WRAPPER } from "@/components/ui/field-styles";
import { SelectField } from "@/components/ui/SelectField";
import { playSound } from "@/lib/sound/client/play-sound";
import { describeSchedule, describeWeekdays } from "@/lib/medications/schedule-summary";
import { TREATMENT_STATE_LABELS } from "@/lib/medications/labels";
import { formatQuantity } from "@/lib/domain/quantity";
import type { MedicationForm, TreatmentState, UserMedicationRecord } from "@/lib/domain/user-medication";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";
import type { ScheduleEdit } from "@/lib/medications/client/save-medication-edits";

export interface EditMedicationValues {
  customName: string | null;
  customForm: MedicationForm | null;
  customStrengthValue: string | null;
  customStrengthUnit: string | null;
  treatmentState: TreatmentState;
  inventoryUnit: MedicationForm;
  lowStockThresholdValue: string | null;
  expiryWarningDays: number;
  notes: string | null;
}

/** Lets the page's header "Αποθήκευση" button submit this form via the standard HTML `form="…"` attribute — no ref/JS wiring. */
export const EDIT_MEDICATION_FORM_ID = "edit-medication-form";

const MAX_TIMES = 12;
const FREQUENCY_OPTIONS = [1, 2, 3, 4, 5, 6];
/** Times offered when a slot is added, in order — the first not already used wins. */
const SUGGESTED_TIMES = ["08:00", "20:00", "14:00", "22:00", "11:00", "17:00"];

function timesPerDayLabel(n: number): string {
  return n === 1 ? "1 φορά την ημέρα" : `${n} φορές την ημέρα`;
}

function nextSuggestedTime(existing: string[]): string {
  const free = SUGGESTED_TIMES.find((t) => !existing.includes(t));
  if (free) return free;
  const last = existing[existing.length - 1] ?? "08:00";
  const hour = (Number(last.slice(0, 2)) + 1) % 24;
  return `${String(hour).padStart(2, "0")}:${last.slice(3, 5)}`;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * `/medications/[id]/edit`, laid out after the reference mockup's screen 11:
 * name, strength, form, then the schedule's frequency, times and start
 * date, then notes; stock and treatment-state settings follow in their own
 * section. `medication.catalogProductId` set means name/form/strength are
 * the catalog product's own fields (ADR-004: a relationship, never merged
 * into a copy), so they aren't editable here.
 *
 * Only a wall-clock schedule's times and start date are editable (the
 * every-N-hours and as-needed kinds show read-only) — what the user says
 * they were prescribed, entered by them; the app never suggests a dose.
 */
export function EditMedicationForm({
  medication,
  displayName,
  schedule,
  onSubmit,
  error,
}: {
  medication: UserMedicationRecord;
  /** Resolved name: a catalog product's full official description, or `medication.customName` — shown read-only when catalog-linked. */
  displayName: string;
  /** The medication's current schedule, if it has one. */
  schedule: MedicationScheduleRecord | null;
  onSubmit: (values: EditMedicationValues, scheduleEdit: ScheduleEdit | null) => void;
  error: string | null;
}) {
  const isCatalogLinked = medication.catalogProductId !== null;
  const editableSchedule = schedule?.timeAnchor === "wall_clock" ? schedule : null;
  const [customName, setCustomName] = useState(medication.customName ?? "");
  const [customForm, setCustomForm] = useState<MedicationForm | null>(medication.customForm);
  // The database returns numerics at full scale ("500.000") — show what the user typed ("500").
  const [customStrengthValue, setCustomStrengthValue] = useState(medication.customStrengthValue ? formatQuantity(medication.customStrengthValue) : "");
  const [customStrengthUnit, setCustomStrengthUnit] = useState(medication.customStrengthUnit ?? "");
  const [times, setTimes] = useState<string[]>(() => (editableSchedule?.timesOfDay ?? []).map((t) => t.slice(0, 5)));
  const [startDate, setStartDate] = useState(schedule?.startDate ?? "");
  const [treatmentState, setTreatmentState] = useState<TreatmentState>(medication.treatmentState);
  const [inventoryUnit, setInventoryUnit] = useState<MedicationForm>(medication.inventoryUnit);
  const [lowStockThresholdValue, setLowStockThresholdValue] = useState(medication.lowStockThresholdValue ? formatQuantity(medication.lowStockThresholdValue) : "");
  const [expiryWarningDays, setExpiryWarningDays] = useState(String(medication.expiryWarningDays));
  const [notes, setNotes] = useState(medication.notes ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  function setTimeCount(count: number) {
    setTimes((current) => {
      const next = current.slice(0, count);
      while (next.length < count) next.push(nextSuggestedTime(next));
      return next;
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isCatalogLinked && customName.trim().length === 0) {
      setValidationError("Το όνομα του φαρμάκου είναι απαραίτητο.");
      return;
    }
    const parsedExpiryWarningDays = Number(expiryWarningDays);
    if (!Number.isFinite(parsedExpiryWarningDays) || parsedExpiryWarningDays < 0) {
      setValidationError("Οι μέρες προειδοποίησης λήξης πρέπει να είναι μη αρνητικός αριθμός.");
      return;
    }
    if (editableSchedule) {
      if (times.length === 0 || times.some((t) => !TIME_PATTERN.test(t))) {
        setValidationError("Συμπληρώστε κάθε ώρα δόσης.");
        return;
      }
      if (!startDate) {
        setValidationError("Συμπληρώστε την ημερομηνία έναρξης.");
        return;
      }
      if (editableSchedule.endDate && startDate > editableSchedule.endDate) {
        setValidationError("Η έναρξη δεν μπορεί να είναι μετά τη λήξη του προγράμματος.");
        return;
      }
    }
    setValidationError(null);
    playSound("button");
    onSubmit(
      {
        customName: isCatalogLinked ? medication.customName : customName.trim(),
        customForm: isCatalogLinked ? medication.customForm : customForm,
        customStrengthValue: isCatalogLinked ? medication.customStrengthValue : customStrengthValue.trim() || null,
        customStrengthUnit: isCatalogLinked ? medication.customStrengthUnit : customStrengthUnit.trim() || null,
        treatmentState,
        inventoryUnit,
        lowStockThresholdValue: lowStockThresholdValue.trim() || null,
        expiryWarningDays: parsedExpiryWarningDays,
        notes: notes.trim() || null,
      },
      editableSchedule ? { scheduleId: editableSchedule.id, timesOfDay: times.map((t) => `${t}:00`), startDate } : null,
    );
  }

  return (
    <form id={EDIT_MEDICATION_FORM_ID} onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {isCatalogLinked ? (
        <div className="surface-card flex flex-col gap-1 p-4">
          <span className="text-sm font-medium text-stone-500 dark:text-stone-400">Φάρμακο από τον κατάλογο</span>
          <p className="text-[19px] font-bold">{displayName}</p>
          <p className="text-[15px] text-stone-600 dark:text-stone-400">Το όνομα, η μορφή και η περιεκτικότητα έρχονται από τον κατάλογο και δεν αλλάζουν εδώ.</p>
        </div>
      ) : (
        <>
          <label className={FIELD_WRAPPER}>
            <span className={FIELD_LABEL}>Όνομα</span>
            <input type="text" value={customName} onChange={(e) => setCustomName(e.target.value)} className={`${FIELD_INPUT} pr-4`} />
          </label>

          <fieldset className={FIELD_WRAPPER}>
            <legend className={`${FIELD_LABEL} mb-2`}>Περιεκτικότητα</legend>
            <div className="flex gap-3">
              <input
                type="text"
                inputMode="decimal"
                value={customStrengthValue}
                onChange={(e) => setCustomStrengthValue(e.target.value)}
                aria-label="Τιμή περιεκτικότητας"
                placeholder="π.χ. 500"
                className={`${FIELD_INPUT} pr-4`}
              />
              <input
                type="text"
                value={customStrengthUnit}
                onChange={(e) => setCustomStrengthUnit(e.target.value)}
                aria-label="Μονάδα περιεκτικότητας"
                placeholder="mg"
                className={`${FIELD_INPUT} max-w-28 pr-4`}
              />
            </div>
          </fieldset>

          <SelectField label="Μορφή" value={customForm ?? ""} onChange={(e) => setCustomForm(e.target.value ? (e.target.value as MedicationForm) : null)}>
            <option value="">Επιλέξτε…</option>
            {FORM_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {FORM_LABELS[option]}
              </option>
            ))}
          </SelectField>
        </>
      )}

      {editableSchedule ? (
        <>
          <SelectField label="Συχνότητα" value={String(Math.min(times.length, FREQUENCY_OPTIONS.length))} onChange={(e) => setTimeCount(Number(e.target.value))}>
            {FREQUENCY_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {timesPerDayLabel(n)}
              </option>
            ))}
            {times.length > FREQUENCY_OPTIONS.length && <option value={times.length}>{timesPerDayLabel(times.length)}</option>}
          </SelectField>
          {editableSchedule.scheduleKind === "specific_weekdays" && (
            <p className="-mt-2 text-[15px] text-stone-600 dark:text-stone-400">Ημέρες: {describeWeekdays(editableSchedule.weekdaysMask ?? 0)}</p>
          )}

          <fieldset className={FIELD_WRAPPER}>
            <legend className={`${FIELD_LABEL} mb-2`}>Ώρες</legend>
            <ul className="grid grid-cols-2 gap-3">
              {times.map((time, index) => (
                <li key={index} className="relative">
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTimes((current) => current.map((t, i) => (i === index ? e.target.value : t)))}
                    aria-label={`Ώρα δόσης ${index + 1}`}
                    className={`${FIELD_INPUT} tabular-nums [&::-webkit-calendar-picker-indicator]:hidden ${times.length > 1 ? "pr-11" : "pr-4"}`}
                  />
                  {times.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        playSound("button");
                        setTimes((current) => current.filter((_, i) => i !== index));
                      }}
                      aria-label={`Αφαίρεση ώρας ${time}`}
                      className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 active:bg-stone-100 dark:active:bg-stone-800"
                    >
                      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m5.5 5.5 9 9m0-9-9 9" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {times.length < MAX_TIMES && (
              <button
                type="button"
                onClick={() => {
                  playSound("button");
                  setTimes((current) => [...current, nextSuggestedTime(current)]);
                }}
                className="mt-1 inline-flex min-h-11 items-center gap-1.5 self-start text-[17px] font-semibold text-accent-700 dark:text-accent-400"
              >
                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M10 4v12M4 10h12" strokeLinecap="round" />
                </svg>
                Προσθήκη ώρας
              </button>
            )}
          </fieldset>

          <label className={FIELD_WRAPPER}>
            <span className={FIELD_LABEL}>Ημερομηνία έναρξης</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${FIELD_INPUT} pr-4`} />
          </label>
        </>
      ) : (
        <div className={FIELD_WRAPPER}>
          <span className={FIELD_LABEL}>Συχνότητα</span>
          <p className="text-[17px] text-stone-600 dark:text-stone-400">{schedule ? describeSchedule(schedule) : "Χωρίς πρόγραμμα δόσεων"}</p>
        </div>
      )}

      <label className={FIELD_WRAPPER}>
        <span className={FIELD_LABEL}>Σημειώσεις</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Προαιρετικό"
          className={`${FIELD_INPUT} min-h-24 py-3.5 pr-4`}
        />
      </label>

      <h2 className="mt-3 text-[20px] font-bold tracking-tight text-stone-900 dark:text-stone-50">Απόθεμα και κατάσταση</h2>

      <SelectField label="Κατάσταση θεραπείας" value={treatmentState} onChange={(e) => setTreatmentState(e.target.value as TreatmentState)}>
        {(Object.entries(TREATMENT_STATE_LABELS) as [TreatmentState, string][]).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      {treatmentState !== "active" && medication.treatmentState === "active" && (
        <p className="-mt-2 text-[15px] text-stone-600 dark:text-stone-400">Οι επόμενες δόσεις και οι υπενθυμίσεις του θα ακυρωθούν.</p>
      )}

      <SelectField label="Μονάδα αποθέματος" value={inventoryUnit} onChange={(e) => setInventoryUnit(e.target.value as MedicationForm)}>
        {FORM_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {FORM_LABELS[option]}
          </option>
        ))}
      </SelectField>

      <label className={FIELD_WRAPPER}>
        <span className={FIELD_LABEL}>Όριο χαμηλού αποθέματος</span>
        <input
          type="text"
          inputMode="decimal"
          value={lowStockThresholdValue}
          onChange={(e) => setLowStockThresholdValue(e.target.value)}
          placeholder="Προαιρετικό"
          className={`${FIELD_INPUT} pr-4`}
        />
      </label>

      <label className={FIELD_WRAPPER}>
        <span className={FIELD_LABEL}>Μέρες προειδοποίησης λήξης</span>
        <input type="text" inputMode="numeric" value={expiryWarningDays} onChange={(e) => setExpiryWarningDays(e.target.value)} className={`${FIELD_INPUT} pr-4`} />
      </label>

      {(validationError ?? error) && (
        <p role="alert" className="text-[15px] font-medium text-red-700 dark:text-red-400">
          {validationError ?? error}
        </p>
      )}
    </form>
  );
}
