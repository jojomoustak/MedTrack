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
  { bg: "bg-blue-100", text: "text-blue-600" },
  { bg: "bg-amber-100", text: "text-amber-500" },
  { bg: "bg-rose-100", text: "text-rose-500" },
  { bg: "bg-violet-100", text: "text-violet-600" },
  { bg: "bg-accent-100", text: "text-accent-600" },
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
