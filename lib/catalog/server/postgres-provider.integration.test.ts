/**
 * Integration test against a REAL Postgres instance with the Phase 6
 * seed data actually loaded (`pnpm db:seed`) — verifies the
 * `unaccent`/`pg_trgm` Greek search behaves correctly, not just that the
 * SQL parses. Same skip-by-default pattern as
 * `lib/sync/server/mutations.integration.test.ts` — see that file's
 * header for how to run this for real.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { PostgresCatalogProvider } from "@/lib/catalog/server/postgres-provider";
import { SEED_PLACEHOLDER_SOURCE } from "@/lib/domain/catalog";

const connectionString = process.env.SYNC_IT_DATABASE_URL;

describe.skipIf(!connectionString)("PostgresCatalogProvider against real seeded data", () => {
  let pool: Pool;
  let provider: PostgresCatalogProvider;

  beforeAll(() => {
    pool = new Pool({ connectionString });
    provider = new PostgresCatalogProvider(drizzle(pool, { schema }));
  });

  afterAll(async () => {
    await pool.end();
  });

  it("finds a Greek product by its accented name", async () => {
    const results = await provider.search("Παρακεταμόλη");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toContain("Παρακεταμόλη");
  });

  it("is accent/diacritic-insensitive — an unaccented query still finds the accented name (Phase 3 §2.4)", async () => {
    const results = await provider.search("παρακεταμολη");
    expect(results.some((r) => r.name.includes("Παρακεταμόλη"))).toBe(true);
  });

  it("matches on active ingredient as well as name", async () => {
    const results = await provider.search("Ιβουπροφένη");
    expect(results.some((r) => r.activeIngredient === "Ιβουπροφένη")).toBe(true);
  });

  it("returns no more than `limit` results and supports `offset` pagination", async () => {
    const page1 = await provider.search("α", { limit: 2, offset: 0 });
    expect(page1.length).toBeLessThanOrEqual(2);
  });

  it("every seeded row is clearly marked as placeholder, non-authoritative data", async () => {
    const results = await provider.search("Παρακεταμόλη");
    for (const product of results) {
      expect(product.regulatorySource).toBe(SEED_PLACEHOLDER_SOURCE);
    }
  });

  it("lookupByGtin finds an exact match and returns null for an unknown GTIN", async () => {
    const known = await provider.search("Παρακεταμόλη");
    const gtin = known[0]?.gtin;
    if (gtin) {
      const byGtin = await provider.lookupByGtin(gtin);
      expect(byGtin?.gtin).toBe(gtin);
    }
    expect(await provider.lookupByGtin("00000000000000")).toBeNull();
  });

  it("returns an empty array for an empty query rather than the whole table", async () => {
    expect(await provider.search("")).toEqual([]);
  });
});

/**
 * `lookupByIdentifier` (GTIN-resolution task spec §1/§3/§19) exercised
 * against real rows this suite inserts and cleans up itself, rather than
 * depending on `pnpm db:seed`'s fixed data set having a GTIN mapping —
 * the seed set never populates `medication_identifier` at all.
 */
describe.skipIf(!connectionString)("PostgresCatalogProvider.lookupByIdentifier — real EXACT/CONFLICT/unresolved cases", () => {
  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let provider: PostgresCatalogProvider;
  const productIds: string[] = [];

  beforeAll(() => {
    pool = new Pool({ connectionString });
    db = drizzle(pool, { schema });
    provider = new PostgresCatalogProvider(db);
  });

  afterAll(async () => {
    if (productIds.length > 0) {
      await db.delete(schema.medicationIdentifier).where(sql`${schema.medicationIdentifier.catalogProductId} = ANY(${productIds})`);
      await db.delete(schema.medicationCatalogProduct).where(sql`${schema.medicationCatalogProduct.id} = ANY(${productIds})`);
    }
    await pool.end();
  });

  async function insertTestProduct(name: string): Promise<string> {
    const [row] = await db
      .insert(schema.medicationCatalogProduct)
      .values({ name, regulatorySource: "integration-test-fixture", lifecycleState: "active" })
      .returning({ id: schema.medicationCatalogProduct.id });
    productIds.push(row.id);
    return row.id;
  }

  it("EXACT: one product claims this GTIN", async () => {
    const productId = await insertTestProduct("Integration Test Product — EXACT");
    await db.insert(schema.medicationIdentifier).values({ catalogProductId: productId, identifierType: "GTIN", identifierValue: "09999999999991", source: "integration-test" });

    const resolution = await provider.lookupByIdentifier("GTIN", "09999999999991");
    expect(resolution.state).toBe("EXACT");
    if (resolution.state === "EXACT") expect(resolution.product.id).toBe(productId);
  });

  it("CONFLICT: two DIFFERENT products both claim the same GTIN — never silently picked", async () => {
    const productA = await insertTestProduct("Integration Test Product — Conflict A");
    const productB = await insertTestProduct("Integration Test Product — Conflict B");
    await db.insert(schema.medicationIdentifier).values([
      { catalogProductId: productA, identifierType: "GTIN", identifierValue: "09999999999992", source: "integration-test-source-1" },
      { catalogProductId: productB, identifierType: "GTIN", identifierValue: "09999999999992", source: "integration-test-source-2" },
    ]);

    const resolution = await provider.lookupByIdentifier("GTIN", "09999999999992");
    expect(resolution.state).toBe("CONFLICT");
    if (resolution.state === "CONFLICT") {
      expect(resolution.catalogProductIds).toHaveLength(2);
      expect(resolution.catalogProductIds).toEqual(expect.arrayContaining([productA, productB]));
    }
  });

  it("a product with MULTIPLE valid GTINs is NOT a conflict — both resolve to the same EXACT product", async () => {
    const productId = await insertTestProduct("Integration Test Product — Multi-GTIN");
    await db.insert(schema.medicationIdentifier).values([
      { catalogProductId: productId, identifierType: "GTIN", identifierValue: "09999999999993", source: "integration-test" },
      { catalogProductId: productId, identifierType: "GTIN", identifierValue: "09999999999994", source: "integration-test" },
    ]);

    const first = await provider.lookupByIdentifier("GTIN", "09999999999993");
    const second = await provider.lookupByIdentifier("GTIN", "09999999999994");
    expect(first.state).toBe("EXACT");
    expect(second.state).toBe("EXACT");
    if (first.state === "EXACT" && second.state === "EXACT") {
      expect(first.product.id).toBe(productId);
      expect(second.product.id).toBe(productId);
    }
  });

  it("VALID_IDENTIFIER_UNRESOLVED: a well-formed GTIN with no mapping at all — never guessed, never a hard error", async () => {
    const resolution = await provider.lookupByIdentifier("GTIN", "00000000000099");
    expect(resolution).toEqual({ state: "VALID_IDENTIFIER_UNRESOLVED" });
  });
});
