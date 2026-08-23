/**
 * `MedicationCatalogProvider` backed by the seed-placeholder set in
 * Postgres (`lib/db/seed.ts`), queried via the `unaccent`/`pg_trgm`
 * columns/index already in place from Phase 4
 * (`medication_catalog_product.name_normalized`,
 * `ix_catalog_name_trgm`). `medication_catalog_product` has no owner/no
 * RLS (Phase 2 §2.4) — this queries `getDb()` directly, no
 * `withProfileScope` needed, matching the "no owner, no client conflict
 * strategy" design decision.
 */
import { sql } from "drizzle-orm";
import { getDb, type Db, type TestableDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import type { CatalogProduct, CatalogSearchOptions, MedicationCatalogProvider } from "@/lib/domain/catalog";

export class PostgresCatalogProvider implements MedicationCatalogProvider {
  constructor(private readonly db: Db | TestableDb = getDb()) {}

  async search(query: string, options: CatalogSearchOptions = {}): Promise<CatalogProduct[]> {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const normalizedQuery = query.trim();
    if (normalizedQuery.length === 0) return [];

    // Built via Drizzle's query builder (`.select().from(...)`), NOT a
    // raw `SELECT *` — a raw query returns the database's own snake_case
    // column names (`active_ingredient`, `regulatory_source`, ...),
    // silently breaking the camelCase `CatalogProduct` contract every
    // caller relies on (confirmed by actually running this against real
    // seeded data: a raw-SQL version of this method passed a shallow
    // "does it return rows" check but every field came back `undefined`
    // once read through the typed shape). Only the WHERE/ORDER BY
    // fragments need raw `sql`, for pg_trgm's `%`/`similarity()`, which
    // Drizzle has no query-builder helper for.
    const { medicationCatalogProduct: t } = schema;
    return this.db
      .select()
      .from(t)
      .where(
        sql`${t.lifecycleState} <> 'discontinued'
          AND (
            ${t.nameNormalized} % lower(immutable_unaccent(${normalizedQuery}))
            OR ${t.nameNormalized} ILIKE '%' || lower(immutable_unaccent(${normalizedQuery})) || '%'
            OR ${t.activeIngredient} ILIKE '%' || ${normalizedQuery} || '%'
          )`,
      )
      .orderBy(sql`similarity(${t.nameNormalized}, lower(immutable_unaccent(${normalizedQuery}))) DESC, ${t.name} ASC`)
      .limit(limit)
      .offset(offset);
  }

  async lookupByGtin(gtin: string): Promise<CatalogProduct | null> {
    const [row] = await this.db.select().from(schema.medicationCatalogProduct).where(sql`${schema.medicationCatalogProduct.gtin} = ${gtin}`).limit(1);
    return row ?? null;
  }

  async lookupByEofCode(eofCode: string): Promise<CatalogProduct | null> {
    const [row] = await this.db
      .select()
      .from(schema.medicationCatalogProduct)
      .where(sql`${schema.medicationCatalogProduct.eofCode} = ${eofCode}`)
      .limit(1);
    return row ?? null;
  }
}
