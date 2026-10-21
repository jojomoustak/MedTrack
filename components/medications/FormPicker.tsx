"use client";

import { useState } from "react";
import { FORM_LABELS } from "@/components/medications/form-options";
import { MedicationFormGlyph } from "@/components/medications/MedicationAvatar";
import type { MedicationForm } from "@/lib/domain/user-medication";
import { playSound } from "@/lib/sound/client/play-sound";
import { useT, T } from "@/lib/i18n/client";

/**
 * The forms a medicine comes in, as tiles with the same glyphs its row
 * shows later (`MedicationFormGlyph`). Liquids and creams are named the way
 * people say them, with the unit they're counted in beside the name.
 */
const TILES: { form: MedicationForm; label: string; unit?: string }[] = [
  { form: "tablet", label: FORM_LABELS.tablet },
  { form: "capsule", label: FORM_LABELS.capsule },
  { form: "ml", label: "Σιρόπι", unit: "ml" },
  { form: "drop", label: FORM_LABELS.drop },
  { form: "spray", label: FORM_LABELS.spray },
  { form: "sachet", label: FORM_LABELS.sachet },
  { form: "g", label: "Κρέμα", unit: "g" },
  { form: "patch", label: FORM_LABELS.patch },
  { form: "injection", label: FORM_LABELS.injection },
];

/** Measures rather than forms, rarely the right answer: behind «Άλλη μορφή». */
const MORE: MedicationForm[] = ["dose", "mg", "mcg", "other"];

/**
 * «Μορφή» on Add medicine (owner-reported 2026-10-20: the options were
 * scattered, then still a jumble of forms and units in one grid). Nine
 * forms in a 3×3 grid; the measures open below on request, already open
 * when one of them is the current choice.
 */
export function FormPicker({ value, onChange }: { value: MedicationForm | null; onChange: (form: MedicationForm) => void }) {
  const t = useT();
  const [showMore, setShowMore] = useState(value !== null && MORE.includes(value));

  function choose(form: MedicationForm) {
    playSound("button");
    onChange(form);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label={t("Μορφή φαρμάκου")}>
        {TILES.map(({ form, label, unit }) => {
          const checked = value === form;
          return (
            <button
              key={form}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={unit ? `${t(label)} (${unit})` : t(label)}
              onClick={() => choose(form)}
              className={`flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-3 transition duration-150 active:scale-95 ${
                checked
                  ? "bg-accent-700 text-white shadow-[0_2px_8px_rgb(4_120_87/0.28)]"
                  : "bg-white text-accent-600 shadow-[0_1px_2px_rgb(28_25_23/0.05),0_2px_8px_rgb(28_25_23/0.06)]"
              }`}
            >
              <MedicationFormGlyph form={form} size={34} />
              <span className={`text-[15px] font-semibold leading-tight ${checked ? "text-white" : "text-stone-800"}`}>
                {t(label)}
                {unit && <span className={`font-medium ${checked ? "text-accent-100" : "text-stone-500"}`}> {unit}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-expanded={showMore}
        onClick={() => {
          playSound("button");
          setShowMore((s) => !s);
        }}
        className="inline-flex min-h-11 items-center gap-1 self-start text-[16px] font-semibold text-accent-700"
      >
        <T>Άλλη μορφή</T>
        <svg
          viewBox="0 0 20 20"
          width="18"
          height="18"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-200 ${showMore ? "rotate-180" : ""}`}
        >
          <path d="m5.5 8 4.5 4.5L14.5 8" />
        </svg>
      </button>

      {showMore && (
        <div className="-mt-1 grid grid-cols-4 gap-2" role="radiogroup" aria-label={t("Άλλη μορφή")}>
          {MORE.map((form) => {
            const checked = value === form;
            return (
              <button
                key={form}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => choose(form)}
                className={`min-h-12 rounded-xl px-1 text-[15px] font-semibold transition duration-150 active:scale-95 ${
                  checked ? "bg-accent-700 text-white" : "bg-surface-muted text-stone-700"
                }`}
              >
                {t(FORM_LABELS[form])}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
