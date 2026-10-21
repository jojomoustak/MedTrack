"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { FORM_LABELS, FORM_OPTIONS } from "@/components/medications/form-options";
import type { MedicationForm } from "@/lib/domain/user-medication";
import { playSound } from "@/lib/sound/client/play-sound";
import { useT, T } from "@/lib/i18n/client";

/**
 * «Μονάδα αποθέματος» as one line, not a second question after «Μορφή»
 * (owner-reported 2026-10-20: «Δισκίο» was picked twice). The stock is
 * nearly always counted in the form itself, so the screen keeps it in
 * step with the form; «Αλλαγή» opens the choice for the rare case it
 * differs (drops counted in ml). `onChoose` is only a choice made here.
 */
export function StockUnitField({ value, onChoose }: { value: MedicationForm; onChoose: (unit: MedicationForm) => void }) {
  const t = useT();
  const [changing, setChanging] = useState(false);

  if (changing) {
    return (
      <SelectField label={t("Μονάδα αποθέματος")} value={value} onChange={(e) => onChoose(e.target.value as MedicationForm)}>
        {FORM_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {t(FORM_LABELS[option])}
          </option>
        ))}
      </SelectField>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[15px] text-stone-700">
        <T>Μονάδα αποθέματος:</T> <span className="font-semibold text-stone-900">{t(FORM_LABELS[value])}</span>
      </p>
      <Button
        variant="tertiary"
        onClick={() => {
          playSound("button");
          setChanging(true);
        }}
        className="min-h-11 px-0 underline"
      >
        <T>Αλλαγή</T>
      </Button>
    </div>
  );
}
