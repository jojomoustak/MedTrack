"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { FIELD_INPUT, FIELD_LABEL, FIELD_WRAPPER } from "@/components/ui/field-styles";
import type { CatalogProduct } from "@/lib/domain/catalog";
import type { MedicationForm } from "@/lib/domain/user-medication";
import { playSound } from "@/lib/sound/client/play-sound";

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
    playSound("button");
    onSubmit({ form, strengthValue, strengthUnit, inventoryUnit });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="surface-card flex flex-col gap-0.5 p-4">
        <span className="text-sm font-medium text-stone-500 dark:text-stone-400">Φάρμακο</span>
        <p className="text-[19px] font-bold text-stone-900 dark:text-stone-50">{displayName}</p>
      </div>

      <fieldset className={FIELD_WRAPPER}>
        <legend className={`${FIELD_LABEL} mb-2`}>Μορφή</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Μορφή φαρμάκου">
          {FORM_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={form === option}
              onClick={() => {
                playSound("button");
                setForm(option);
              }}
              className={`min-h-12 rounded-xl px-4 py-2 text-[15px] font-semibold transition duration-200 active:scale-95 ${
                form === option ? "bg-accent-700 text-white dark:bg-accent-500 dark:text-stone-950" : "bg-surface-muted text-stone-700 dark:text-stone-300"
              }`}
            >
              {FORM_LABELS[option]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={FIELD_WRAPPER}>
        <legend className={`${FIELD_LABEL} mb-2`}>Περιεκτικότητα</legend>
        <div className="flex gap-3">
          <input
            type="text"
            inputMode="decimal"
            value={strengthValue}
            onChange={(e) => setStrengthValue(e.target.value)}
            aria-label="Τιμή περιεκτικότητας"
            placeholder="π.χ. 500"
            className={`${FIELD_INPUT} pr-4`}
          />
          <input
            type="text"
            value={strengthUnit}
            onChange={(e) => setStrengthUnit(e.target.value)}
            aria-label="Μονάδα περιεκτικότητας"
            placeholder="mg"
            className={`${FIELD_INPUT} max-w-28 pr-4`}
          />
        </div>
      </fieldset>

      <SelectField label="Μονάδα αποθέματος" value={inventoryUnit} onChange={(e) => setInventoryUnit(e.target.value as MedicationForm)}>
        {FORM_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {FORM_LABELS[option]}
          </option>
        ))}
      </SelectField>

      <Button type="submit" size="lg" fullWidth>
        Συνέχεια
      </Button>
    </form>
  );
}
