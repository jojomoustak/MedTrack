/**
 * Source-specific adapter (medication-resolution-architecture.md §14/spec
 * §14: "one giant parser" is explicitly the wrong shape) for the
 * Ministry of Health's ΜΗ.ΣΥ.ΦΑ. (non-prescription/OTC) price-bulletin
 * XLSX format — confirmed real by directly downloading and inspecting
 * seven real files spanning 2024-2026 (`data/raw/ministry/mysyfa/`,
 * moh.gov.gr, 2026-08-24): the four 2025/2026 quarterly + annual-revision
 * bulletins, and three 2024 ones.
 *
 * The Ministry does NOT use one fixed header row across files — column
 * TEXT and ORDER both vary release to release (real, observed examples):
 *
 *   EOF code:        "ΚΩΔΙΚΟΣ" | "Κωδικός"
 *   product name:     "ΟΝΟΜΑΣΙΑ ΠΡΟΪΟΝΤΟΣ" | "Περιγραφή Προϊόντος" | "ΠΡΟΪΟΝ"
 *   active ingredient: "Δραστική ουσία" | "Δραστική Ουσία" | "Δραστική/ες"
 *   MAH:               "ΚΑΚ" | "KAK" (the second is Latin K-A-K, not Greek — same header, different script, seen verbatim in real files)
 *
 * `BARCODE`, `ATC`, and "Ενδεικτική Λιανική Τιμή" (retail price) were
 * consistent across every file inspected. This adapter matches by a
 * normalized (accent-stripped, uppercased, whitespace-trimmed) form
 * against a synonym list built ONLY from headers actually observed in a
 * real downloaded file — never a guessed pattern — and still fails loudly
 * (throws) if a required column isn't found under any known synonym,
 * rather than silently misreading a genuinely new layout.
 *
 * Pure mapping only — no file I/O, no XLSX-library calls, no database
 * access. Takes already-parsed rows (e.g. from
 * `XLSX.utils.sheet_to_json(sheet, { header: 1 })`) so this stays testable
 * against small hand-built fixtures (spec §35) without touching a real
 * file. `scripts/import/run-mysyfa-import.ts` is the thin wrapper that
 * actually reads a real workbook and calls this.
 *
 * Free-text normalization of the product-description column into
 * structured `productName`/`strengthValue`/`pharmaceuticalForm`/
 * `packageDescription` fields (spec §23) is deliberately NOT attempted
 * here — real bulletin strings like "LIBERIZIN TAB 1,5MG/TAB  BT X 100
 * TABS ΣΕ ΚΥΨΕΛΕΣ PVC/PCTFE/ALUMINIUM" need a genuinely separate,
 * carefully-tested parser to split reliably, and guessing at it risks
 * exactly the "ambiguous rows guessed rather than left partial" failure
 * mode the spec rules out. `rawProductDescription` is preserved in full;
 * the structured fields are left `undefined` until a dedicated normalizer exists.
 */
import type { MedicationImportRecord } from "@/lib/domain/medication-import";

type CanonicalField = "EOF_CODE" | "BARCODE" | "PRODUCT_DESCRIPTION" | "ATC" | "RETAIL_PRICE" | "ACTIVE_INGREDIENT" | "MAH";

/** Every value here is copied verbatim from a real downloaded file's header row — never invented. */
const HEADER_SYNONYMS: Record<CanonicalField, readonly string[]> = {
  EOF_CODE: ["ΚΩΔΙΚΟΣ"],
  BARCODE: ["BARCODE"],
  PRODUCT_DESCRIPTION: ["ΟΝΟΜΑΣΙΑ ΠΡΟΪΟΝΤΟΣ", "ΠΕΡΙΓΡΑΦΗ ΠΡΟΪΟΝΤΟΣ", "ΠΡΟΪΟΝ"],
  ATC: ["ATC"],
  RETAIL_PRICE: ["Ενδεικτική Λιανική Τιμή"],
  ACTIVE_INGREDIENT: ["Δραστική ουσία", "Δραστική Ουσία", "Δραστική/ες"],
  MAH: ["ΚΑΚ", "KAK"],
};

const REQUIRED_FIELDS: readonly CanonicalField[] = ["EOF_CODE", "BARCODE", "PRODUCT_DESCRIPTION", "ATC", "RETAIL_PRICE", "ACTIVE_INGREDIENT", "MAH"];

export interface MysyfaImportResult {
  records: MedicationImportRecord[];
  /** Rows skipped because a required cell was missing/blank — never silently coerced into a record with a fabricated value (spec §16/§23). */
  skippedRowNumbers: number[];
}

function normalizeCell(value: unknown): string {
  // Real cells from these bulletins carry stray \r\n and leading/trailing
  // spaces (observed directly, e.g. "338280101\r\n", " AFLOFARM..." — not
  // hypothetical) — trimmed here, once, rather than at every call site.
  return String(value ?? "").replace(/\r?\n/g, "").trim();
}

/** Accent-stripped, uppercased, whitespace-collapsed — so "Δραστική ουσία", "ΔΡΑΣΤΙΚΉ ΟΥΣΊΑ", and "δραστικη  ουσια" all compare equal, without ever fabricating a match no real file has used. */
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

/**
 * Locates each required column by header text (via `NORMALIZED_SYNONYMS`)
 * rather than a fixed index — robust to both column reordering and
 * header-text variation between releases (both confirmed real, not
 * hypothetical — see module doc), at the cost of failing loudly (throws)
 * if a header this adapter depends on isn't found under any known
 * synonym, rather than silently misreading a genuinely new layout.
 */
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
      `MYSYFA importer: required column(s) not found under any known header synonym: ${missing.join(", ")}. ` +
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
export function parseMysyfaBulletinRows(rows: readonly (readonly unknown[])[], sourceSnapshotId: string): MysyfaImportResult {
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
