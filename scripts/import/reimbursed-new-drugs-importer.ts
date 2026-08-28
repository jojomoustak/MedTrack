/**
 * Source-specific adapter for the Ministry of Health's reimbursed/
 * prescription-track ("Δελτίο Τιμών") "new drugs" sub-table — confirmed
 * real by downloading and inspecting an actual file (Q1 2026, moh.gov.gr,
 * `data/raw/ministry/reimbursed/`, 2026-08-24). Real header row:
 *
 *   Κωδικός | BARCODE | Περιγραφή Προϊόντος | ATC | Μη Αποζημιούμενο | Τιμή Παραγωγού | Χονδρική Τιμή | Λιανική Τιμή | Δραστική/ες | KAK | ΦΠΑ
 *
 * ...and, confirmed by inspecting the December 2025 comprehensive
 * revised-prices baseline bulletin (8,510 rows — the actual "all currently
 * priced reimbursed products" baseline, not a delta), a further real
 * variant of the SAME document family:
 *
 *   Κωδικός | Barcode | Προϊόν | ATC | Μη Αποζημιούμενο | Τιμή Παραγωγού | Χονδρική Τιμή | Λιανική Τιμή | Δραστική ουσία | Κάτοχος Άδειας Κυκλοφορίας | ΦΠΑ
 *
 * (mixed-case "Barcode" — already covered by normalization being
 * case-insensitive; "Προϊόν" and "Δραστική ουσία" already covered by
 * synonyms shared with `mysyfa-importer.ts`'s equivalents; "Κάτοχος Άδειας
 * Κυκλοφορίας" — the MAH column's full, unabbreviated name — is new and
 * added below.)
 *
 * Deliberately a SEPARATE adapter from `mysyfa-importer.ts` (spec §14:
 * "one giant parser" is the wrong shape), even though both ultimately
 * produce the same `MedicationImportRecord` shape — this is a genuinely
 * different document family: the retail-price column is labeled "Λιανική
 * Τιμή" here, not MYSYFA's "Ενδεικτική Λιανική Τιμή", and there's a
 * wholesale-price column MYSYFA's bulletin doesn't have at all. Real
 * barcode-decode confirmed against real rows from multiple files in this
 * family (AFLIBERCEPT/MYNZEPLI, DORALIN/OTILONIUM, MAXUDIN/PRAVASTATIN)
 * — same `280`+EOF-code+check-digit scheme as every other Greek pharma
 * barcode (architecture doc §2.5), as expected: it's a national scheme,
 * not specific to one bulletin track.
 *
 * Scope note: covers the "new drugs"/"new generics"/"repricing"/
 * "non-reimbursed adjustment"/"comprehensive revision" sub-tables of the
 * reimbursed-track bulletin family — all confirmed to share this shape.
 * Not yet covering: whatever the "Θετική Λίστα" (positive/reimbursement
 * list) publishes separately, if its format differs — not inspected in
 * this pass.
 *
 * Pure mapping only — same constraints as `mysyfa-importer.ts` (no I/O,
 * no free-text product-description normalization, testable against small
 * hand-built fixtures per spec §35).
 */
import type { MedicationImportRecord } from "@/lib/domain/medication-import";

type CanonicalField = "EOF_CODE" | "BARCODE" | "PRODUCT_DESCRIPTION" | "ATC" | "RETAIL_PRICE" | "ACTIVE_INGREDIENT" | "MAH";

/** Every value here is copied verbatim from the real downloaded file's header row — never invented. */
const HEADER_SYNONYMS: Record<CanonicalField, readonly string[]> = {
  EOF_CODE: ["Κωδικός"],
  BARCODE: ["BARCODE", "Barcode"],
  PRODUCT_DESCRIPTION: ["Περιγραφή Προϊόντος", "Προϊόν"],
  ATC: ["ATC"],
  RETAIL_PRICE: ["Λιανική Τιμή"],
  ACTIVE_INGREDIENT: ["Δραστική/ες", "Δραστική ουσία"],
  MAH: ["KAK", "ΚΑΚ", "Κάτοχος Άδειας Κυκλοφορίας"],
};

const REQUIRED_FIELDS: readonly CanonicalField[] = ["EOF_CODE", "BARCODE", "PRODUCT_DESCRIPTION", "ATC", "RETAIL_PRICE", "ACTIVE_INGREDIENT", "MAH"];

export interface ReimbursedNewDrugsImportResult {
  records: MedicationImportRecord[];
  /** Rows skipped because a required cell was missing/blank — never silently coerced into a record with a fabricated value (spec §16/§23). */
  skippedRowNumbers: number[];
}

function normalizeCell(value: unknown): string {
  return String(value ?? "").replace(/\r?\n/g, "").trim();
}

function normalizeHeaderText(value: unknown): string {
  return normalizeCell(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks (accents/dialytika) left behind by NFD decomposition
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function buildNormalizedSynonyms(): Record<CanonicalField, readonly string[]> {
  const result = {} as Record<CanonicalField, readonly string[]>;
  for (const field of Object.keys(HEADER_SYNONYMS) as CanonicalField[]) {
    result[field] = HEADER_SYNONYMS[field].map(normalizeHeaderText);
  }
  return result;
}

const NORMALIZED_SYNONYMS = buildNormalizedSynonyms();

function findHeaderIndices(headerRow: readonly unknown[]): Record<CanonicalField, number> {
  const normalizedRow = headerRow.map(normalizeHeaderText);
  const indices = {} as Record<CanonicalField, number>;
  const missing: CanonicalField[] = [];

  for (const field of REQUIRED_FIELDS) {
    const idx = normalizedRow.findIndex((h) => NORMALIZED_SYNONYMS[field].includes(h));
    if (idx === -1) {
      missing.push(field);
    } else {
      indices[field] = idx;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Reimbursed new-drugs importer: required column(s) not found under any known header synonym: ${missing.join(", ")}. ` +
        `Header row was: ${JSON.stringify(headerRow)}. ` +
        "The Ministry may have introduced a new column label — do not guess a mapping; inspect the real file and add the observed header text to HEADER_SYNONYMS.",
    );
  }

  return indices;
}

/**
 * Maps raw XLSX rows (row 0 = header) into canonical `MedicationImportRecord`s.
 * `sourceSnapshotId` is stamped onto every record for provenance
 * (architecture doc §13/§30) — the caller is responsible for having
 * already created the corresponding `medication_catalog_source_snapshot`
 * row before calling this.
 */
export function parseReimbursedNewDrugsRows(rows: readonly (readonly unknown[])[], sourceSnapshotId: string): ReimbursedNewDrugsImportResult {
  if (rows.length === 0) return { records: [], skippedRowNumbers: [] };

  const headers = findHeaderIndices(rows[0]);

  const records: MedicationImportRecord[] = [];
  const skippedRowNumbers: number[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const eofCode = normalizeCell(row[headers.EOF_CODE]);
    const barcode = normalizeCell(row[headers.BARCODE]);
    const rawProductDescription = normalizeCell(row[headers.PRODUCT_DESCRIPTION]);

    if (!eofCode || !rawProductDescription) {
      skippedRowNumbers.push(i);
      continue;
    }

    records.push({
      eofCode,
      barcode: barcode || undefined,
      rawProductDescription,
      atcCode: normalizeCell(row[headers.ATC]) || undefined,
      retailPrice: normalizeCell(row[headers.RETAIL_PRICE]) || undefined,
      activeIngredient: normalizeCell(row[headers.ACTIVE_INGREDIENT]) || undefined,
      marketingAuthorisationHolder: normalizeCell(row[headers.MAH]) || undefined,
      sourceSnapshotId,
      sourceRowNumber: i,
    });
  }

  return { records, skippedRowNumbers };
}
