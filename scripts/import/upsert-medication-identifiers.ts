/**
 * Bulk-writes `MedicationIdentifierImportRecord`s into `medication_identifier`
 * (GTIN-resolution task spec §7/§12) — the write half of the "source-
 * adapter interface" this task asks be ready even with no real bulk GTIN
 * source confirmed yet (spec §6/§26). Mirrors
 * `scripts/import/upsert-catalog-records.ts`'s batched-SQL-upsert shape
 * for the same reason: this table can receive thousands of rows once a
 * real source is found, and a per-row round-trip loop doesn't scale (that
 * file's own header comment documents the real timing that motivated it).
 *
 * Uses `ON CONFLICT ... DO NOTHING`, not `DO UPDATE` — unlike the catalog
 * product upsert, every column here (`catalog_product_id`,
 * `identifier_type`, `identifier_value`, `source`) together IS the
 * uniqueness key (`uq_medication_identifier_no_dupe_import`), so there is
 * nothing to "update" on a re-import of the same row; a genuinely new
 * fact (a different `valid_from`/`valid_to`) is a new row, not an edit.
 */
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";
import { validateIdentifierImportRecord, type MedicationIdentifierImportRecord } from "@/lib/domain/medication-identifier-import";

const BATCH_SIZE = 500;

export interface IdentifierUpsertSummary {
  inserted: number;
  alreadyPresent: number;
  unknownEofCode: number;
  malformedGtin: number;
}

export async function upsertMedicationIdentifiers(
  db: NodePgDatabase<typeof schema>,
  records: readonly MedicationIdentifierImportRecord[],
  log: (...args: unknown[]) => void = console.warn,
): Promise<IdentifierUpsertSummary> {
  const summary: IdentifierUpsertSummary = { inserted: 0, alreadyPresent: 0, unknownEofCode: 0, malformedGtin: 0 };

  const validRecords: MedicationIdentifierImportRecord[] = [];
  for (const record of records) {
    const validation = validateIdentifierImportRecord(record);
    if (validation.status === "malformed_gtin") {
      log(`Row ${record.sourceRowNumber} (EOF ${record.eofCode}): malformed_gtin`, { identifierValue: record.identifierValue });
      summary.malformedGtin++;
      continue;
    }
    validRecords.push(record);
  }

  if (validRecords.length === 0) return summary;

  // Resolve eofCode -> catalogProductId in one query, not one per record.
  const distinctEofCodes = [...new Set(validRecords.map((r) => r.eofCode))];
  const productRows = await db
    .select({ id: schema.medicationCatalogProduct.id, eofCode: schema.medicationCatalogProduct.eofCode })
    .from(schema.medicationCatalogProduct)
    .where(sql`${schema.medicationCatalogProduct.eofCode} = ANY(${distinctEofCodes})`);
  const productIdByEofCode = new Map(productRows.map((r) => [r.eofCode as string, r.id]));

  const insertable: { catalogProductId: string; identifierType: string; identifierValue: string; source: string; validFrom: string | null; validTo: string | null }[] = [];
  for (const record of validRecords) {
    const catalogProductId = productIdByEofCode.get(record.eofCode);
    if (!catalogProductId) {
      log(`Row ${record.sourceRowNumber}: unknown_eof_code`, { eofCode: record.eofCode });
      summary.unknownEofCode++;
      continue;
    }
    insertable.push({
      catalogProductId,
      identifierType: record.identifierType,
      identifierValue: record.identifierValue,
      source: record.source,
      validFrom: record.validFrom ?? null,
      validTo: record.validTo ?? null,
    });
  }

  for (let i = 0; i < insertable.length; i += BATCH_SIZE) {
    const batch = insertable.slice(i, i + BATCH_SIZE);
    const result = await db
      .insert(schema.medicationIdentifier)
      .values(batch)
      .onConflictDoNothing({ target: [schema.medicationIdentifier.catalogProductId, schema.medicationIdentifier.identifierType, schema.medicationIdentifier.identifierValue, schema.medicationIdentifier.source] })
      .returning({ id: schema.medicationIdentifier.id });

    summary.inserted += result.length;
    summary.alreadyPresent += batch.length - result.length;
  }

  return summary;
}
