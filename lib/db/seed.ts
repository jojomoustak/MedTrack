/**
 * Seed data for `medication_catalog_product` — deliberately versioned
 * separately from schema migrations (Phase 2 §7: "a seed-data change is
 * not a schema change and shouldn't be gated by the same review as a
 * CHECK constraint edit").
 *
 * This is a SMALL, EXPLICITLY-LABELED PLACEHOLDER SET, not real Greek
 * medication market data. Per Phase 1 §8, no external medication data
 * source (EOF/EMA/etc.) is verified/integrated for this project — every
 * row below carries `regulatory_source = 'seed-placeholder-not-verified'`
 * so it can never be mistaken for authoritative coverage. Names used are
 * generic/INN (international nonproprietary) drug names, not specific
 * real branded products, and `manufacturer` is a clearly fictitious
 * placeholder string — chosen so the search/catalog UX can be exercised
 * meaningfully without dressing this up as real regulatory data. Manual
 * entry (`lib/domain/user-medication.ts`, `customName`) remains the
 * primary, fully-functional path for real users at MVP.
 *
 * Idempotent — safe to re-run (`ON CONFLICT (gtin) DO NOTHING`, plus a
 * name-based skip for the null-GTIN rows).
 */
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { SEED_PLACEHOLDER_SOURCE } from "@/lib/domain/catalog";

try {
  process.loadEnvFile(".env.local");
} catch {
  try {
    process.loadEnvFile(".env");
  } catch {
    // rely on real process.env (CI/production tooling)
  }
}

const PLACEHOLDER_MANUFACTURER = "Placeholder Pharma (test data, not a real company)";
const SOURCE_VERSION = "phase6-seed-v1";

interface SeedRow {
  gtin: string | null;
  name: string;
  activeIngredient: string;
  strengthValue: string;
  strengthUnit: string;
  form: (typeof schema.medicationCatalogProduct.$inferInsert)["form"];
  packSizeValue: string;
  packSizeUnit: string;
}

const SEED_ROWS: SeedRow[] = [
  { gtin: "05201234500017", name: "Παρακεταμόλη 500mg", activeIngredient: "Παρακεταμόλη", strengthValue: "500", strengthUnit: "mg", form: "tablet", packSizeValue: "20", packSizeUnit: "tablet" },
  { gtin: "05201234500024", name: "Ιβουπροφένη 400mg", activeIngredient: "Ιβουπροφένη", strengthValue: "400", strengthUnit: "mg", form: "tablet", packSizeValue: "20", packSizeUnit: "tablet" },
  { gtin: "05201234500031", name: "Αμοξικιλλίνη 500mg", activeIngredient: "Αμοξικιλλίνη", strengthValue: "500", strengthUnit: "mg", form: "capsule", packSizeValue: "16", packSizeUnit: "capsule" },
  { gtin: null, name: "Ασπιρίνη 100mg", activeIngredient: "Ακετυλοσαλικυλικό οξύ", strengthValue: "100", strengthUnit: "mg", form: "tablet", packSizeValue: "30", packSizeUnit: "tablet" },
  { gtin: "05201234500048", name: "Ομεπραζόλη 20mg", activeIngredient: "Ομεπραζόλη", strengthValue: "20", strengthUnit: "mg", form: "capsule", packSizeValue: "14", packSizeUnit: "capsule" },
  { gtin: null, name: "Μετφορμίνη 850mg", activeIngredient: "Μετφορμίνη", strengthValue: "850", strengthUnit: "mg", form: "tablet", packSizeValue: "30", packSizeUnit: "tablet" },
  { gtin: "05201234500055", name: "Ατορβαστατίνη 20mg", activeIngredient: "Ατορβαστατίνη", strengthValue: "20", strengthUnit: "mg", form: "tablet", packSizeValue: "28", packSizeUnit: "tablet" },
  { gtin: null, name: "Σαλβουταμόλη Εισπνεόμενο", activeIngredient: "Σαλβουταμόλη", strengthValue: "100", strengthUnit: "mcg", form: "spray", packSizeValue: "200", packSizeUnit: "dose" },
  { gtin: "05201234500062", name: "Λοραζεπάμη 1mg", activeIngredient: "Λοραζεπάμη", strengthValue: "1", strengthUnit: "mg", form: "tablet", packSizeValue: "20", packSizeUnit: "tablet" },
  { gtin: null, name: "Ρανιτιδίνη 150mg", activeIngredient: "Ρανιτιδίνη", strengthValue: "150", strengthUnit: "mg", form: "tablet", packSizeValue: "20", packSizeUnit: "tablet" },
  { gtin: "05201234500079", name: "Σιρόπι για τον Βήχα", activeIngredient: "Δεξτρομεθορφάνη", strengthValue: "15", strengthUnit: "mg", form: "ml", packSizeValue: "120", packSizeUnit: "ml" },
  { gtin: null, name: "Ρινικές Σταγόνες Φυσιολογικού Ορού", activeIngredient: "Χλωριούχο νάτριο", strengthValue: "0.9", strengthUnit: "g", form: "drop", packSizeValue: "10", packSizeUnit: "ml" },
  { gtin: "05201234500086", name: "Επίθεμα Διαδερμικό Νικοτίνης", activeIngredient: "Νικοτίνη", strengthValue: "14", strengthUnit: "mg", form: "patch", packSizeValue: "7", packSizeUnit: "patch" },
  { gtin: null, name: "Ινσουλίνη Ενέσιμο Διάλυμα", activeIngredient: "Ινσουλίνη", strengthValue: "100", strengthUnit: "mg", form: "injection", packSizeValue: "1", packSizeUnit: "dose" },
  { gtin: "05201234500093", name: "Βιταμίνη D3 Σταγόνες", activeIngredient: "Χοληκαλσιφερόλη", strengthValue: "400", strengthUnit: "mcg", form: "drop", packSizeValue: "10", packSizeUnit: "ml" },
];

async function main() {
  const directUrl = process.env.DATABASE_URL_DIRECT;
  if (!directUrl) {
    throw new Error("DATABASE_URL_DIRECT is required to seed the catalog (see .env.example).");
  }

  const client = new Client({ connectionString: directUrl });
  await client.connect();
  const db = drizzle(client, { schema });

  try {
    let inserted = 0;
    let skipped = 0;
    for (const row of SEED_ROWS) {
      const existing = row.gtin
        ? await db.select({ id: schema.medicationCatalogProduct.id }).from(schema.medicationCatalogProduct).where(eq(schema.medicationCatalogProduct.gtin, row.gtin)).limit(1)
        : await db.select({ id: schema.medicationCatalogProduct.id }).from(schema.medicationCatalogProduct).where(eq(schema.medicationCatalogProduct.name, row.name)).limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      await db.insert(schema.medicationCatalogProduct).values({
        gtin: row.gtin,
        name: row.name,
        manufacturer: PLACEHOLDER_MANUFACTURER,
        activeIngredient: row.activeIngredient,
        strengthValue: row.strengthValue,
        strengthUnit: row.strengthUnit,
        form: row.form,
        packSizeValue: row.packSizeValue,
        packSizeUnit: row.packSizeUnit,
        regulatorySource: SEED_PLACEHOLDER_SOURCE,
        sourceVersion: SOURCE_VERSION,
        sourceLastUpdated: new Date().toISOString(),
        lifecycleState: "active",
      });
      inserted++;
    }

    console.log(`Catalog seed complete: ${inserted} inserted, ${skipped} already present.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Catalog seed failed:", err);
  process.exitCode = 1;
});
