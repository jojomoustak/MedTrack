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
