import { formatQuantity } from "@/lib/domain/quantity";
import type { Language } from "@/lib/i18n/language";

/** Lowercase Greek singular/plural per unit, for inline phrases like "1 δισκίο • 08:00" (FORM_LABELS is capitalized and singular, for pickers). */
const UNIT_FORMS: Record<string, [singular: string, plural: string]> = {
  tablet: ["δισκίο", "δισκία"],
  capsule: ["κάψουλα", "κάψουλες"],
  dose: ["δόση", "δόσεις"],
  spray: ["ψεκασμός", "ψεκασμοί"],
  drop: ["σταγόνα", "σταγόνες"],
  sachet: ["φακελάκι", "φακελάκια"],
  patch: ["επίθεμα", "επιθέματα"],
  injection: ["ένεση", "ενέσεις"],
  ml: ["ml", "ml"],
  mg: ["mg", "mg"],
  mcg: ["mcg", "mcg"],
  g: ["g", "g"],
};

/** English (2026-10-21): "1 tablet", "2 tablets". */
const UNIT_FORMS_EN: Record<string, [singular: string, plural: string]> = {
  tablet: ["tablet", "tablets"],
  capsule: ["capsule", "capsules"],
  dose: ["dose", "doses"],
  spray: ["spray", "sprays"],
  drop: ["drop", "drops"],
  sachet: ["sachet", "sachets"],
  patch: ["patch", "patches"],
  injection: ["injection", "injections"],
  ml: ["ml", "ml"],
  mg: ["mg", "mg"],
  mcg: ["mcg", "mcg"],
  g: ["g", "g"],
};

/** "1 δισκίο", "2 δισκία", "0.5 δισκίο", "5 ml" ("1 tablet", "2 tablets" in English). Null when there's no quantity to show. */
export function doseQuantityLabel(value: string | null, unit: string | null, language: Language = "el"): string | null {
  if (!value) return null;
  const amount = formatQuantity(value);
  const forms = unit ? (language === "en" ? UNIT_FORMS_EN : UNIT_FORMS)[unit] : undefined;
  if (!forms) return amount;
  const n = Number(amount);
  // Greek takes the plural above one and for zero ("0 δισκία"); a fraction of one reads as singular ("0.5 δισκίο").
  // English, for anything but exactly one ("0.5 tablets").
  const plural = language === "en" ? n !== 1 : n > 1 || n === 0;
  return `${amount} ${plural ? forms[1] : forms[0]}`;
}
