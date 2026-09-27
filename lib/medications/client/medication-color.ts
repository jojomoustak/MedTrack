/**
 * Rebrand (2026-09-27): the reference identity color-codes each
 * medication with a stable, deterministic avatar hue (PRODUCT.md Product
 * Principle 4 / the direction contract's OWN-WORLD) — never on status
 * (status stays icon+text everywhere, the app's own non-negotiable
 * accessibility rule). A fixed five-color rotation, hashed off the
 * medication's own id so the same medication always gets the same color
 * on every screen (Today, Medications list, Calendar) without persisting
 * anything server-side for it.
 */
const PALETTE = [
  { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300" },
  { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300" },
  { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-300" },
  { bg: "bg-violet-100 dark:bg-violet-900/40", text: "text-violet-700 dark:text-violet-300" },
  { bg: "bg-accent-100 dark:bg-accent-900/40", text: "text-accent-700 dark:text-accent-400" },
] as const;

export interface MedicationColor {
  bg: string;
  text: string;
}

export function medicationColorClasses(medicationId: string): MedicationColor {
  let hash = 0;
  for (let i = 0; i < medicationId.length; i++) {
    hash = (hash * 31 + medicationId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
