/**
 * CLI entry point: reads a real, already-downloaded reimbursed-track
 * "new drugs" price bulletin XLSX file (`data/raw/ministry/reimbursed/`,
 * see `data/README.md`), records a `medication_catalog_source_snapshot`
 * provenance row, parses it via `reimbursed-new-drugs-importer.ts`'s pure
 * mapper, validates each record's barcode against its declared EOF code
 * (mismatches logged and SKIPPED, never silently fixed, spec §16), and
 * upserts the rest into `medication_catalog_product` keyed by `eofCode`
 * — same idempotent shape as `run-mysyfa-import.ts`.
 *
 * DEV-ONLY TOOLING. Same `EOF_DEV_IMPORT_SOURCE` provenance stamp and the
 * same "not yet cleared for production" boundary as the MYSYFA importer
 * (`data/README.md`).
 *
 * Usage: pnpm tsx scripts/import/run-reimbursed-new-drugs-import.ts <path-to-xlsx>
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import * as schema from "@/lib/db/schema";
import { EOF_DEV_IMPORT_SOURCE } from "@/lib/domain/catalog";
import { validateImportRecord } from "@/lib/domain/medication-import";
import { parseReimbursedNewDrugsRows } from "@/scripts/import/reimbursed-new-drugs-importer";

try {
  process.loadEnvFile(".env.local");
} catch {
  try {
    process.loadEnvFile(".env");
  } catch {
    // rely on real process.env (CI/production tooling) — same fallback as lib/db/seed.ts
  }
}

const IMPORT_VERSION = "reimbursed-new-drugs-import-v1";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: pnpm tsx scripts/import/run-reimbursed-new-drugs-import.ts <path-to-xlsx>");
    process.exit(1);
  }

  const fileBuffer = readFileSync(filePath);
  const checksumSha256 = createHash("sha256").update(fileBuffer).digest("hex");
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });

  const directUrl = process.env.DATABASE_URL_DIRECT;
  if (!directUrl) {
    throw new Error("DATABASE_URL_DIRECT is required to import the catalog (see .env.example) — same direct, non-pooled connection lib/db/migrate.ts and lib/db/seed.ts use, per ADR-002.");
  }
  const client = new Client({ connectionString: directUrl });
  await client.connect();
  const db = drizzle(client, { schema });

  try {
    const [snapshot] = await db
      .insert(schema.medicationCatalogSourceSnapshot)
      .values({
        sourceOrganization: "MINISTRY_OF_HEALTH",
        datasetType: "NEW_PRODUCTS",
        sourceUrl: "https://www.moh.gov.gr/articles/times-farmakwn/deltia-timwn/",
        downloadedAt: new Date().toISOString(),
        filename: basename(filePath),
        checksumSha256,
        importVersion: IMPORT_VERSION,
        status: "parsed",
      })
      .returning({ id: schema.medicationCatalogSourceSnapshot.id });

    const { records, skippedRowNumbers } = parseReimbursedNewDrugsRows(rows, snapshot.id);
    if (skippedRowNumbers.length > 0) {
      console.warn(`Skipped ${skippedRowNumbers.length} row(s) with missing required fields: rows ${skippedRowNumbers.join(", ")}`);
    }

    let inserted = 0;
    let updated = 0;
    let rejectedForMismatch = 0;

    for (const record of records) {
      const validation = validateImportRecord(record);
      if (validation.status !== "ok") {
        console.warn(`Row ${record.sourceRowNumber} (EOF ${record.eofCode}): ${validation.status}`, validation);
        rejectedForMismatch++;
        continue;
      }

      const existing = await db
        .select({ id: schema.medicationCatalogProduct.id })
        .from(schema.medicationCatalogProduct)
        .where(eq(schema.medicationCatalogProduct.eofCode, record.eofCode))
        .limit(1);

      const values = {
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
        sourceVersion: IMPORT_VERSION,
        sourceLastUpdated: new Date().toISOString(),
        lifecycleState: "active" as const,
      };

      if (existing.length > 0) {
        await db.update(schema.medicationCatalogProduct).set(values).where(eq(schema.medicationCatalogProduct.id, existing[0].id));
        updated++;
      } else {
        await db.insert(schema.medicationCatalogProduct).values(values);
        inserted++;
      }
    }

    await db
      .update(schema.medicationCatalogSourceSnapshot)
      .set({ status: "imported", recordCount: records.length })
      .where(sql`${schema.medicationCatalogSourceSnapshot.id} = ${snapshot.id}`);

    console.log(`Reimbursed new-drugs import complete: ${inserted} inserted, ${updated} updated, ${rejectedForMismatch} rejected (barcode/EOF-code mismatch), ${skippedRowNumbers.length} skipped (missing fields).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Reimbursed new-drugs import failed:", err);
  process.exit(1);
});
