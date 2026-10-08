import { formatQuantity } from "@/lib/domain/quantity";

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

/** "1 δισκίο", "2 δισκία", "0.5 δισκίο", "5 ml". Null when there's no quantity to show. */
export function doseQuantityLabel(value: string | null, unit: string | null): string | null {
  if (!value) return null;
  const amount = formatQuantity(value);
  const forms = unit ? UNIT_FORMS[unit] : undefined;
  if (!forms) return amount;
  // Greek takes the plural above one and for zero ("0 δισκία"); a fraction of one reads as singular ("0.5 δισκίο").
  const n = Number(amount);
  const plural = n > 1 || n === 0;
  return `${amount} ${plural ? forms[1] : forms[0]}`;
}
