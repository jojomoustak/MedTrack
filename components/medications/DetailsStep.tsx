"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { FIELD_INPUT, FIELD_LABEL, FIELD_WRAPPER } from "@/components/ui/field-styles";
import type { CatalogProduct } from "@/lib/domain/catalog";
import { shortCatalogName } from "@/lib/domain/catalog-short-name";
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
  // The stock is counted in the form chosen above (tablets in tablets), so
  // it isn't asked again: it follows the form until the person changes it
  // themselves (owner-reported 2026-10-20: «Δισκίο» was asked twice).
  const [changingUnit, setChangingUnit] = useState(false);
  const [unitChosen, setUnitChosen] = useState(false);

  // The product is chosen by its full description (search, confirmation); from here on it goes by its everyday name.
  const displayName = catalogProduct ? shortCatalogName(catalogProduct.name) : (manualName ?? "");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    playSound("button");
    onSubmit({ form, strengthValue, strengthUnit, inventoryUnit });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="surface-card flex flex-col gap-0.5 p-4">
        <span className="text-sm font-medium text-stone-500">Φάρμακο</span>
        <p className="text-[19px] font-bold text-stone-900">{displayName}</p>
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
                if (!unitChosen) setInventoryUnit(option);
              }}
              className={`min-h-12 rounded-xl px-4 py-2 text-[15px] font-semibold transition duration-200 active:scale-95 ${
                form === option ? "bg-accent-700 text-white" : "bg-surface-muted text-stone-700"
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

      {changingUnit ? (
        <SelectField
          label="Μονάδα αποθέματος"
          value={inventoryUnit}
          onChange={(e) => {
            setInventoryUnit(e.target.value as MedicationForm);
            setUnitChosen(true);
          }}
        >
          {FORM_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {FORM_LABELS[option]}
            </option>
          ))}
        </SelectField>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] text-stone-700">
            Μονάδα αποθέματος: <span className="font-semibold text-stone-900">{FORM_LABELS[inventoryUnit]}</span>
          </p>
          <Button
            variant="tertiary"
            onClick={() => {
              playSound("button");
              setChangingUnit(true);
            }}
            className="min-h-11 px-0 underline"
          >
            Αλλαγή
          </Button>
        </div>
      )}

      <Button type="submit" size="lg" fullWidth>
        Συνέχεια
      </Button>
    </form>
  );
}
