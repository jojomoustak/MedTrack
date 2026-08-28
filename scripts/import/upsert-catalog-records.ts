/**
 * Shared bulk-upsert path for `run-mysyfa-import.ts` and
 * `run-reimbursed-new-drugs-import.ts` — factored out once the
 * comprehensive December 2025 baseline bulletin (8,510 rows) made clear
 * that a per-row SELECT-then-INSERT/UPDATE loop (the original shape,
 * fine for the ~20-700-row files this was first built against) does not
 * scale: at roughly one network round-trip pair per row against a real
 * Neon connection, 8,510 rows would take tens of minutes and risk an
 * interrupted, partially-applied run.
 *
 * Uses a genuine SQL upsert (`INSERT ... ON CONFLICT (eof_code) DO
 * UPDATE`, batched) instead — a handful of round trips regardless of
 * record count. Insert-vs-update is distinguished per Postgres's own
 * `xmax = 0` idiom (a freshly-inserted row's xmax is 0; an
 * updated-via-conflict row's is not) rather than a separate read, so the
 * accurate counts this project's coverage reporting depends on (spec §19)
 * don't cost an extra query per row either.
 *
 * A single multi-row `INSERT ... ON CONFLICT` cannot target the same
 * conflict key twice within one statement (Postgres error: "ON CONFLICT
 * DO UPDATE command cannot affect row a second time") — real bulletin
 * files can and do contain the same EOF code more than once (observed:
 * the December 2025 baseline had duplicate rows for some codes). Resolved
 * by de-duplicating within each batch before upserting, keeping the LAST
 * occurrence (closest to "the file's own final word on this product" if
 * the file lists corrections in order) and counting the rest as
 * `duplicateEofCodesWithinBatch` for the coverage report — never silently
 * dropped without being counted.
 */
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";
import { EOF_DEV_IMPORT_SOURCE } from "@/lib/domain/catalog";
import { validateImportRecord, type MedicationImportRecord } from "@/lib/domain/medication-import";

const BATCH_SIZE = 500;

export interface UpsertSummary {
  inserted: number;
  updated: number;
  rejectedForMismatch: number;
  duplicateEofCodesWithinBatch: number;
}

export async function upsertMedicationImportRecords(
  db: NodePgDatabase<typeof schema>,
  records: readonly MedicationImportRecord[],
  importVersion: string,
  log: (...args: unknown[]) => void = console.warn,
): Promise<UpsertSummary> {
  const summary: UpsertSummary = { inserted: 0, updated: 0, rejectedForMismatch: 0, duplicateEofCodesWithinBatch: 0 };

  const validRecords: MedicationImportRecord[] = [];
  for (const record of records) {
    const validation = validateImportRecord(record);
    if (validation.status !== "ok") {
      // Never silently "fixed" (spec §16) — logged for manual review, row skipped.
      log(`Row ${record.sourceRowNumber} (EOF ${record.eofCode}): ${validation.status}`, validation);
      summary.rejectedForMismatch++;
      continue;
    }
    validRecords.push(record);
  }

  for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
    const rawBatch = validRecords.slice(i, i + BATCH_SIZE);

    // De-dup within this batch by eofCode, keeping the last occurrence —
    // a single INSERT..ON CONFLICT statement can't target the same
    // conflict key twice (see module doc).
    const byEofCode = new Map<string, MedicationImportRecord>();
    for (const record of rawBatch) {
      if (byEofCode.has(record.eofCode)) summary.duplicateEofCodesWithinBatch++;
      byEofCode.set(record.eofCode, record);
    }
    const batch = [...byEofCode.values()];
    if (batch.length === 0) continue;

    const now = new Date().toISOString();
    const values = batch.map((record) => ({
      eofCode: record.eofCode,
      gtin: null,
      name: record.rawProductDescription,
      manufacturer: record.marketingAuthorisationHolder ?? null,
      activeIngredient: record.activeIngredient ?? null,
      strengthValue: null,
      strengthUnit: null,
      form: null,
      packSizeValue: null,
      packSizeUnit: null,
      regulatorySource: EOF_DEV_IMPORT_SOURCE,
      sourceVersion: importVersion,
      sourceLastUpdated: now,
      lifecycleState: "active" as const,
    }));

    const result = await db
      .insert(schema.medicationCatalogProduct)
      .values(values)
      .onConflictDoUpdate({
        target: schema.medicationCatalogProduct.eofCode,
        // `uq_catalog_eof_code` is a PARTIAL unique index (`WHERE eof_code
        // IS NOT NULL`, lib/db/schema.ts) — without repeating that
        // condition here, Postgres can't infer it as the ON CONFLICT
        // arbiter and errors with "no unique or exclusion constraint
        // matching the ON CONFLICT specification" (caught by a real
        // sanity-check run against the live database before this was
        // trusted on the 8,510-row baseline import).
        targetWhere: sql`${schema.medicationCatalogProduct.eofCode} IS NOT NULL`,
        set: {
          name: sql`excluded.name`,
          manufacturer: sql`excluded.manufacturer`,
          activeIngredient: sql`excluded.active_ingredient`,
          regulatorySource: sql`excluded.regulatory_source`,
          sourceVersion: sql`excluded.source_version`,
          sourceLastUpdated: sql`excluded.source_last_updated`,
          updatedAt: sql`now()`,
        },
      })
      // Postgres's own idiom: a row's xmax is 0 iff this statement inserted
      // it fresh; a non-zero xmax means the conflict branch updated an
      // existing row instead. Distinguishing insert/update without a
      // separate read per row is exactly why this works at bulk-batch speed.
      .returning({ wasInsert: sql<boolean>`(xmax = 0)` });

    for (const row of result) {
      if (row.wasInsert) summary.inserted++;
      else summary.updated++;
    }
  }

  return summary;
}
