import type { MedicationForm } from "@/lib/domain/user-medication";

/** The medication forms a person can pick, and their Greek labels. In their own module so `StockUnitField` and `DetailsStep` can both use them without importing each other. */
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
