/**
 * Barcode classification — the "Barcode Classifier" step of the resolution
 * pipeline (architecture doc §2.5/§6: Raw Scanner Result → Barcode
 * Classifier → Identifier Parser → Medication Identifier → resolution).
 * Decides which of the two structurally different scan paths a raw
 * scanned value belongs to, without doing any resolution itself — pure,
 * I/O-free, composing the two existing pure parsers
 * (`lib/domain/greek-national-barcode.ts` for Path A,
 * `lib/domain/gs1.ts` for Path B) rather than duplicating either.
 */
import type { BarcodeFormat } from "@/lib/domain/gs1";
import { parseBarcode } from "@/lib/domain/gs1";
import type { GreekNationalMedicineIdentifier } from "@/lib/domain/greek-national-barcode";
import { parseGreekNationalMedicineBarcode } from "@/lib/domain/greek-national-barcode";

export interface Gs1GtinIdentifier {
  readonly kind: "GS1_GTIN";
  /** 14-digit GS1-canonical form, same normalization as `ParsedBarcode.gtin` (`lib/domain/gs1.ts`). */
  readonly gtin: string;
}

/**
 * A resolved-enough-to-look-up medication identifier. Deliberately NOT
 * `{ findByGTIN(gtin) }`-shaped (architecture doc §8) — Path A's key is an
 * EOF code, not a GTIN, and forcing it through a GTIN-shaped call would
 * either lose the leading-zero-preserving EOF code or require re-deriving
 * it from a padded GTIN string, both worse than modeling the two paths
 * explicitly.
 */
export type MedicationIdentifier = GreekNationalMedicineIdentifier | Gs1GtinIdentifier;

/**
 * Classifies a raw scanned barcode into a `MedicationIdentifier`, or
 * `null` if neither path recognizes it (e.g. `CODE_128`/`UNKNOWN` formats,
 * or non-numeric content — `lib/domain/gs1.ts`'s existing "never guess"
 * behavior).
 *
 * Path A is tried first and only for `EAN_13` (a Greek national barcode is
 * always a plain 13-digit EAN-13, never a GS1 DataMatrix — architecture
 * doc §2.5/§7 keep the two paths cleanly separated by symbology, not
 * merged). Anything that isn't a valid Path A code — including a
 * `280`-prefixed `EAN_13` value that fails check-digit validation — falls
 * through to the existing GS1 GTIN path unchanged.
 */
export function classifyBarcode(rawValue: string, format: BarcodeFormat): MedicationIdentifier | null {
  if (format === "EAN_13") {
    const greekNational = parseGreekNationalMedicineBarcode(rawValue);
    if (greekNational) return greekNational;
  }

  const parsed = parseBarcode(rawValue, format);
  if (parsed.gtin) return { kind: "GS1_GTIN", gtin: parsed.gtin };

  return null;
}
