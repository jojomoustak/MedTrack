"use client";

import { useState } from "react";
import { FORM_LABELS, FORM_OPTIONS } from "@/components/medications/DetailsStep";
import { playSound } from "@/lib/sound/client/play-sound";
import type { MedicationForm, TreatmentState, UserMedicationRecord } from "@/lib/domain/user-medication";

const TREATMENT_STATE_LABELS: Record<TreatmentState, string> = {
  active: "Ενεργό",
  paused: "Σε παύση",
  completed: "Ολοκληρωμένο",
  discontinued: "Διακοπή",
};

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

/**
 * `/medications/[id]/edit` (Phase 3, built 2026-09-13 alongside real
 * `UserMedication` update support). `medication.catalogProductId` set
 * means name/form/strength are the CATALOG PRODUCT's own fields (ADR-004:
 * a relationship, never merged into a copy) — this form never lets those
 * be edited for that case, matching `DetailsStep`'s own precedent of
 * skipping them entirely for a confirmed catalog match.
 */
export function EditMedicationForm({
  medication,
  displayName,
  onSubmit,
  submitting,
  error,
}: {
  medication: UserMedicationRecord;
  /** Resolved display name (catalog product name, or `medication.customName`) — shown read-only when catalog-linked. */
  displayName: string;
  onSubmit: (values: EditMedicationValues) => void;
  submitting: boolean;
  error: string | null;
}) {
  const isCatalogLinked = medication.catalogProductId !== null;
  const [customName, setCustomName] = useState(medication.customName ?? "");
  const [customForm, setCustomForm] = useState<MedicationForm | null>(medication.customForm);
  const [customStrengthValue, setCustomStrengthValue] = useState(medication.customStrengthValue ?? "");
  const [customStrengthUnit, setCustomStrengthUnit] = useState(medication.customStrengthUnit ?? "");
  const [treatmentState, setTreatmentState] = useState<TreatmentState>(medication.treatmentState);
  const [inventoryUnit, setInventoryUnit] = useState<MedicationForm>(medication.inventoryUnit);
  const [lowStockThresholdValue, setLowStockThresholdValue] = useState(medication.lowStockThresholdValue ?? "");
  const [expiryWarningDays, setExpiryWarningDays] = useState(String(medication.expiryWarningDays));
  const [notes, setNotes] = useState(medication.notes ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

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
    setValidationError(null);
    playSound("button");
    onSubmit({
      customName: isCatalogLinked ? medication.customName : customName.trim(),
      customForm: isCatalogLinked ? medication.customForm : customForm,
      customStrengthValue: isCatalogLinked ? medication.customStrengthValue : customStrengthValue.trim() || null,
      customStrengthUnit: isCatalogLinked ? medication.customStrengthUnit : customStrengthUnit.trim() || null,
      treatmentState,
      inventoryUnit,
      lowStockThresholdValue: lowStockThresholdValue.trim() || null,
      expiryWarningDays: parsedExpiryWarningDays,
      notes: notes.trim() || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {isCatalogLinked ? (
        <div>
          <span className="text-sm text-stone-500">Φάρμακο από τον κατάλογο</span>
          <p className="text-lg font-semibold">{displayName}</p>
          <p className="text-sm text-stone-600 dark:text-stone-400">Το όνομα, η μορφή και η περιεκτικότητα δεν επεξεργάζονται εδώ.</p>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Όνομα φαρμάκου</span>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              aria-label="Όνομα φαρμάκου"
              className="min-h-12 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
            />
          </label>

          <fieldset className="flex flex-col gap-1">
            <legend className="font-medium">Μορφή</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Μορφή φαρμάκου">
              {FORM_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={customForm === option}
                  onClick={() => {
                    playSound("button");
                    setCustomForm(option);
                  }}
                  className={`min-h-12 rounded-full border px-4 py-2 text-sm ${
                    customForm === option
                      ? "border-accent-700 bg-accent-700 text-white dark:border-accent-500 dark:bg-accent-500 dark:text-stone-950"
                      : "border-stone-300 dark:border-stone-700"
                  }`}
                >
                  {FORM_LABELS[option]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1">
              <span className="font-medium">Περιεκτικότητα</span>
              <input
                type="text"
                inputMode="decimal"
                value={customStrengthValue}
                onChange={(e) => setCustomStrengthValue(e.target.value)}
                aria-label="Τιμή περιεκτικότητας"
                className="min-h-12 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="font-medium">Μονάδα</span>
              <input
                type="text"
                value={customStrengthUnit}
                onChange={(e) => setCustomStrengthUnit(e.target.value)}
                aria-label="Μονάδα περιεκτικότητας"
                className="min-h-12 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
              />
            </label>
          </div>
        </>
      )}

      <label className="flex flex-col gap-1">
        <span className="font-medium">Μονάδα αποθέματος</span>
        <select
          value={inventoryUnit}
          onChange={(e) => setInventoryUnit(e.target.value as MedicationForm)}
          aria-label="Μονάδα αποθέματος"
          className="min-h-12 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
        >
          {FORM_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {FORM_LABELS[option]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Κατάσταση θεραπείας</span>
        <select
          value={treatmentState}
          onChange={(e) => setTreatmentState(e.target.value as TreatmentState)}
          aria-label="Κατάσταση θεραπείας"
          className="min-h-12 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
        >
          {(Object.entries(TREATMENT_STATE_LABELS) as [TreatmentState, string][]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Όριο χαμηλού αποθέματος (προαιρετικό)</span>
        <input
          type="text"
          inputMode="decimal"
          value={lowStockThresholdValue}
          onChange={(e) => setLowStockThresholdValue(e.target.value)}
          aria-label="Όριο χαμηλού αποθέματος"
          className="min-h-12 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Μέρες προειδοποίησης λήξης</span>
        <input
          type="text"
          inputMode="numeric"
          value={expiryWarningDays}
          onChange={(e) => setExpiryWarningDays(e.target.value)}
          aria-label="Μέρες προειδοποίησης λήξης"
          className="min-h-12 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Σημειώσεις (προαιρετικό)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          aria-label="Σημειώσεις"
          rows={3}
          className="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
        />
      </label>

      {(validationError ?? error) && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {validationError ?? error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center justify-center min-h-12 rounded-full bg-accent-700 px-5 py-3 font-medium text-white disabled:opacity-60 dark:bg-accent-500 dark:text-stone-950"
      >
        {submitting ? "Αποθήκευση…" : "Αποθήκευση"}
      </button>
    </form>
  );
}
