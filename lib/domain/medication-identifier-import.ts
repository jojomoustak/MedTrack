/**
 * Canonical staging shape for importing GTIN (or NHRN/EAN13) mappings
 * into `medication_identifier` (GTIN-resolution task spec §7/§12: "add
 * mapping importer/provider interface... so authoritative mappings can
 * be imported later" even though no authoritative bulk source has been
 * confirmed yet — spec §6/§26 explicitly says not to block this
 * architecture on that).
 *
 * Deliberately NOT tied to any specific file format — unlike
 * `MedicationImportRecord` (`lib/domain/medication-import.ts`), which
 * models a real, inspected EOF/Ministry bulletin shape, no real GTIN↔EOF
 * mapping file has been found or inspected as of this writing. Writing a
 * source-specific parser for a file that doesn't exist yet would mean
 * guessing its shape — exactly what this project's working discipline
 * rules out. When a real source is found, its own adapter (mirroring
 * `scripts/import/mysyfa-importer.ts`'s pattern: real header synonyms,
 * fails loudly on an unrecognized layout) should emit records in THIS
 * shape; `upsertMedicationIdentifiers` below is what actually writes them.
 */
export interface MedicationIdentifierImportRecord {
  /** The product this identifier maps to, expressed via its EOF code — MedTrack's own reliable, already-populated key (~9,427 real rows) — rather than a raw UUID a source file would never actually contain. Resolved to `catalog_product_id` at import time. */
  eofCode: string;
  identifierType: "GTIN" | "NHRN" | "EAN13" | "EOF_CODE";
  identifierValue: string;
  source: string;
  validFrom?: string;
  validTo?: string;
  sourceRowNumber: number;
}

export type IdentifierImportRowValidation =
  | { status: "ok" }
  /** The EOF code this row claims doesn't exist in `medication_catalog_product` at all — nothing to attach the identifier to. Logged and skipped, never silently dropped without a trace, never auto-created as a new product from an identifier-mapping file (that's not this file's job). */
  | { status: "unknown_eof_code" }
  /** `identifierType: "GTIN"` with a value that doesn't decode as plausible GS1 GTIN-14 (spec §18: string, not numeric; leading zeros preserved) — a 14-digit-max, all-numeric string. Never coerced, never truncated to fit. */
  | { status: "malformed_gtin" };

const GTIN_PATTERN = /^\d{1,14}$/;

/**
 * Validates a single import record's shape (spec §18: never silently
 * normalize in a way that could create a collision — e.g. never right-pad
 * or truncate a GTIN to force it into 14 digits). Does NOT check whether
 * the EOF code actually exists in the catalog — that requires a database
 * round-trip and is the caller's job (`scripts/import/` CLI wrappers,
 * matching every other importer in this project).
 */
export function validateIdentifierImportRecord(record: MedicationIdentifierImportRecord): IdentifierImportRowValidation {
  if (record.identifierType === "GTIN" && !GTIN_PATTERN.test(record.identifierValue)) {
    return { status: "malformed_gtin" };
  }
  return { status: "ok" };
}
