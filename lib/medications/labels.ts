import type { MedicationForm, TreatmentState } from "@/lib/domain/user-medication";

export const TREATMENT_STATE_LABELS: Record<TreatmentState, string> = {
  active: "Ενεργό",
  paused: "Σε παύση",
  completed: "Ολοκληρωμένο",
  discontinued: "Διακοπή",
};

const DOSAGE_FORM_LABELS: Partial<Record<MedicationForm, string>> = {
  tablet: "Δισκίο",
  capsule: "Κάψουλα",
  drop: "Σταγόνες",
  spray: "Σπρέι",
  sachet: "Φακελάκι",
  patch: "Επίθεμα",
  injection: "Ένεση",
};

/** The dosage form as a word ("Δισκίο") for "500 mg • Δισκίο" lines — null for measurement units (mg, ml, …) and "other", which aren't a form. */
export function dosageFormLabel(form: MedicationForm | null): string | null {
  return form ? (DOSAGE_FORM_LABELS[form] ?? null) : null;
}
