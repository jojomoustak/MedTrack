/**
 * Canonical staging shape for development-only catalog ingestion from
 * official EOF/Ministry of Health bulk datasets
 * (medication-resolution-architecture.md §2.3/§12 item 7 — dataset
 * confirmed to exist; production redistribution NOT yet approved, see
 * `data/README.md`). Every source-specific importer adapter (one per
 * distinct spreadsheet shape — the EOF/Ministry bulletins are NOT a single
 * uniform format) emits this same shape, so downstream normalization/
 * validation/dedup code never needs to know which bulletin a row came
 * from.
 *
 * Pure data + pure validation only in this file — no XLSX parsing, no
 * database access, no network. Source-specific adapters (which DO parse a
 * real file) live under `scripts/import/`.
 */
import { parseGreekNationalMedicineBarcode } from "@/lib/domain/greek-national-barcode";

export interface MedicationImportRecord {
  eofCode: string;
  barcode?: string;

  /** The official source's own description string, verbatim — never discarded even once `productName` etc. are normalized out of it (spec §23: raw + normalized, both kept, so normalization stays auditable). */
  rawProductDescription: string;

  productName?: string;
  strengthValue?: string;
  strengthUnit?: string;
  pharmaceuticalForm?: string;
  packageDescription?: string;

  activeIngredient?: string;
  atcCode?: string;
  marketingAuthorisationHolder?: string;

  retailPrice?: string;

  sourceSnapshotId: string;
  sourceRowNumber: number;
}

export type ImportRowValidation =
  | { status: "ok" }
  /**
   * The record's own `barcode` column decodes (via
   * `parseGreekNationalMedicineBarcode`) to a DIFFERENT EOF code than the
   * record's own `eofCode` column claims. Spec §16: never silently
   * "fixed" — this is a data-quality signal about the source row (or,
   * rarely, about a farmako.net-style secondary-source EOF code display
   * convention that differs from the barcode's own embedded digits — see
   * the architecture doc §2.3's DEPON Syrup example) that must be logged
   * and reviewed, never auto-corrected in either direction.
   */
  | { status: "eof_code_barcode_mismatch"; declaredEofCode: string; decodedEofCode: string }
  /** The record's `barcode` column is present but isn't a well-formed Greek national EAN-13 at all (wrong length, bad check digit, wrong prefix) — a different failure mode than a mismatch, so kept as its own status rather than folded into the mismatch case. */
  | { status: "barcode_invalid"; barcode: string };

/**
 * Cross-checks an import record's declared EOF code against what its own
 * barcode column decodes to, when both are present (spec §16). Returns
 * `{status:"ok"}` when there's nothing to cross-check (no barcode column
 * on this record — not every source row necessarily carries one) or when
 * they agree.
 */
export function validateImportRecord(record: MedicationImportRecord): ImportRowValidation {
  if (!record.barcode) return { status: "ok" };

  const decoded = parseGreekNationalMedicineBarcode(record.barcode);
  if (!decoded) return { status: "barcode_invalid", barcode: record.barcode };

  if (decoded.eofCode !== record.eofCode) {
    return { status: "eof_code_barcode_mismatch", declaredEofCode: record.eofCode, decodedEofCode: decoded.eofCode };
  }

  return { status: "ok" };
}
