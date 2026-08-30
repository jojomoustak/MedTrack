"use client";

import { useState } from "react";
import type { CatalogProduct } from "@/lib/domain/catalog";
import type { MedicationForm } from "@/lib/domain/user-medication";

export const FORM_OPTIONS: MedicationForm[] = [
  "tablet",
  "capsule",
  "ml",
  "mg",
  "mcg",
  "g",
  "dose",
  "spray",
  "drop",
  "sachet",
  "patch",
  "injection",
  "other",
];

export const FORM_LABELS: Record<MedicationForm, string> = {
  tablet: "Δισκίο",
  capsule: "Κάψουλα",
  ml: "ml",
  mg: "mg",
  mcg: "mcg",
  g: "g",
  dose: "Δόση",
  spray: "Σπρέι",
  drop: "Σταγόνες",
  sachet: "Φακελάκι",
  patch: "Επίθεμα",
  injection: "Ένεση",
  other: "Άλλο",
};

export interface DetailsStepValues {
  form: MedicationForm | null;
  strengthValue: string;
  strengthUnit: string;
  inventoryUnit: MedicationForm;
}

export interface DetailsStepProps {
  /** Set when the entry came from catalog search — name/form/strength are shown read-only, sourced from the catalog match (ADR-004: a relationship, never copied/edited into a separate row). */
  catalogProduct: CatalogProduct | null;
  /** Set when the entry came from manual entry. */
  manualName: string | null;
  onSubmit: (values: DetailsStepValues) => void;
}

/** Phase 3 §2.4 "Add Medication — details step": shared step after any entry path — confirm/adjust name, form, strength, inventory unit. */
export function DetailsStep({ catalogProduct, manualName, onSubmit }: DetailsStepProps) {
  const [form, setForm] = useState<MedicationForm | null>((catalogProduct?.form as MedicationForm | null) ?? null);
  const [strengthValue, setStrengthValue] = useState(catalogProduct?.strengthValue ?? "");
  const [strengthUnit, setStrengthUnit] = useState(catalogProduct?.strengthUnit ?? "");
  const [inventoryUnit, setInventoryUnit] = useState<MedicationForm>((catalogProduct?.form as MedicationForm | null) ?? "tablet");

  const displayName = catalogProduct?.name ?? manualName ?? "";

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onSubmit({ form, strengthValue, strengthUnit, inventoryUnit });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <span className="text-sm text-zinc-500">Φάρμακο</span>
        <p className="text-lg font-semibold">{displayName}</p>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="font-medium">Μορφή</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Μορφή φαρμάκου">
          {FORM_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={form === option}
              onClick={() => setForm(option)}
              className={`min-h-12 rounded-full border px-4 py-2 text-sm ${
                form === option
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                  : "border-zinc-300 dark:border-zinc-700"
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
            value={strengthValue}
            onChange={(e) => setStrengthValue(e.target.value)}
            aria-label="Τιμή περιεκτικότητας"
            className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-medium">Μονάδα</span>
          <input
            type="text"
            value={strengthUnit}
            onChange={(e) => setStrengthUnit(e.target.value)}
            aria-label="Μονάδα περιεκτικότητας"
            className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Μονάδα αποθέματος</span>
        <select
          value={inventoryUnit}
          onChange={(e) => setInventoryUnit(e.target.value as MedicationForm)}
          aria-label="Μονάδα αποθέματος"
          className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {FORM_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {FORM_LABELS[option]}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="min-h-12 rounded-full bg-zinc-900 px-5 py-3 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
      >
        Συνέχεια
      </button>
    </form>
  );
}
