import type { CatalogProduct } from "@/lib/domain/catalog";
import { extractPackageOcrResult } from "@/lib/domain/ocr";
import type { MedicationForm } from "@/lib/domain/user-medication";

/** The package reader's forms (`lib/domain/ocr.ts`) as the medication forms a stock is counted in. */
const READ_FORM_TO_MEDICATION_FORM: Readonly<Record<string, MedicationForm>> = {
  TABLET: "tablet",
  CAPSULE: "capsule",
  SYRUP: "ml",
  SUSPENSION: "ml",
  CREAM: "g",
  GEL: "g",
  SPRAY: "spray",
  DROPS: "drop",
  SACHET: "sachet",
  AMPOULE: "injection",
  VIAL: "injection",
};

/**
 * A catalog product's form, as its stock is counted (owner's request,
 * 2026-10-20: «the stock unit should come from the catalog»). Its own
 * `form` when set; otherwise read from its name, which is where the
 * catalog imported from EOF keeps it ("ALGOFREN SYR 100MG/5ML" is counted
 * in ml, "… EFF.GRAN 400MG/SACHET BTX10 SACHETS" in sachets). Null when the
 * name doesn't say.
 */
export function catalogMedicationForm(product: Pick<CatalogProduct, "form" | "name">): MedicationForm | null {
  if (product.form) return product.form as MedicationForm;
  const read = extractPackageOcrResult(product.name).pharmaceuticalForm;
  return read ? (READ_FORM_TO_MEDICATION_FORM[read] ?? null) : null;
}
