/**
 * CLI entry point: reads a real, already-downloaded MYSYFA (OTC) price
 * bulletin XLSX file (`data/raw/ministry/mysyfa/`, see `data/README.md`),
 * records a `medication_catalog_source_snapshot` provenance row, parses it
 * via `mysyfa-importer.ts`'s pure mapper, validates each record's barcode
 * against its declared EOF code (`lib/domain/medication-import.ts` —
 * mismatches are logged and SKIPPED, never silently fixed, spec §16), and
 * upserts the rest into `medication_catalog_product` keyed by `eofCode`
 * (idempotent — same `ON CONFLICT` shape as `lib/db/seed.ts`).
 *
 * DEV-ONLY TOOLING. Every row this writes is stamped
 * `EOF_DEV_IMPORT_SOURCE` (`lib/domain/catalog.ts`) — real official data,
 * but explicitly not yet cleared for production per `data/README.md`'s
 * licensing boundary. Do not point this at a production database without
 * being sure that's actually intended.
 *
 * Usage: pnpm tsx scripts/import/run-mysyfa-import.ts <path-to-xlsx>
 *
 * NOT executed as part of this change — this repo's configured
 * `DATABASE_URL` (`.env.local`) points at what appears to be the real,
 * live application database, and running an unreviewed import against it
 * is exactly the kind of shared-system write that needs explicit
 * confirmation first, not a default action. Written and typechecked, not run.
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
import { parseMysyfaBulletinRows } from "@/scripts/import/mysyfa-importer";

try {
  process.loadEnvFile(".env.local");
} catch {
  try {
    process.loadEnvFile(".env");
  } catch {
    // rely on real process.env (CI/production tooling) — same fallback as lib/db/seed.ts
  }
}

const IMPORT_VERSION = "mysyfa-import-v1";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: pnpm tsx scripts/import/run-mysyfa-import.ts <path-to-xlsx>");
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
        datasetType: "MYSYFA_PRICE_BULLETIN",
        sourceUrl: "https://www.moh.gov.gr/articles/times-farmakwn/deltia-timwn-mhsyfa",
        downloadedAt: new Date().toISOString(),
        filename: basename(filePath),
        checksumSha256,
        importVersion: IMPORT_VERSION,
        status: "parsed",
      })
      .returning({ id: schema.medicationCatalogSourceSnapshot.id });

    const { records, skippedRowNumbers } = parseMysyfaBulletinRows(rows, snapshot.id);
    if (skippedRowNumbers.length > 0) {
      console.warn(`Skipped ${skippedRowNumbers.length} row(s) with missing required fields: rows ${skippedRowNumbers.join(", ")}`);
    }

    let inserted = 0;
    let updated = 0;
    let rejectedForMismatch = 0;

    for (const record of records) {
      const validation = validateImportRecord(record);
      if (validation.status !== "ok") {
        // Never silently "fixed" (spec §16) — logged for manual review, row skipped.
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

    console.log(`MYSYFA import complete: ${inserted} inserted, ${updated} updated, ${rejectedForMismatch} rejected (barcode/EOF-code mismatch), ${skippedRowNumbers.length} skipped (missing fields).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("MYSYFA import failed:", err);
  process.exit(1);
});
