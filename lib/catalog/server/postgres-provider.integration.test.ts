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
import { eq, inArray, sql } from "drizzle-orm";
import { withProfileScope } from "@/lib/db/rls";
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

  it("getByIds returns exactly the asked-for products, skipping unknown ids (2026-10-12)", async () => {
    const known = (await provider.search("Παρακεταμόλη")).slice(0, 2);
    const unknownId = "00000000-0000-4000-8000-000000000000";
    const products = await provider.getByIds([...known.map((p) => p.id), unknownId]);
    expect(products.map((p) => p.id).sort()).toEqual(known.map((p) => p.id).sort());
    expect(await provider.getByIds([])).toEqual([]);
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
    // Same real bug/fix as the describe block below — see its afterAll's comment.
    if (productIds.length > 0) {
      await db.delete(schema.medicationIdentifier).where(inArray(schema.medicationIdentifier.catalogProductId, productIds));
      await db.delete(schema.medicationCatalogProduct).where(inArray(schema.medicationCatalogProduct.id, productIds));
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

  it("EXACT resolutions report evidence: 'AUTHORITATIVE'", async () => {
    const productId = await insertTestProduct("Integration Test Product — Evidence Authoritative");
    await db.insert(schema.medicationIdentifier).values({ catalogProductId: productId, identifierType: "GTIN", identifierValue: "09999999999995", source: "integration-test" });

    const resolution = await provider.lookupByIdentifier("GTIN", "09999999999995");
    expect(resolution).toMatchObject({ state: "EXACT", evidence: "AUTHORITATIVE" });
  });
});

/**
 * `confirmIdentifier`/USER_CONFIRMED precedence and profile-scoping
 * (OCR-fallback task spec §12/§13/§17/§19/§20) — a second self-contained
 * describe block since these fixtures need a real `account`/`profile` pair
 * (the FK `medication_identifier.profile_id` requires one), which the
 * block above doesn't need at all.
 */
describe.skipIf(!connectionString)("PostgresCatalogProvider — USER_CONFIRMED evidence, precedence, and conflict (OCR-fallback task)", () => {
  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let provider: PostgresCatalogProvider;
  const productIds: string[] = [];
  let accountId: string;
  let profileId: string;
  let otherAccountId: string;
  let otherProfileId: string;
  let thirdAccountId: string;
  let thirdProfileId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    db = drizzle(pool, { schema });
    provider = new PostgresCatalogProvider(db);

    accountId = crypto.randomUUID();
    profileId = crypto.randomUUID();
    otherAccountId = crypto.randomUUID();
    otherProfileId = crypto.randomUUID();
    thirdAccountId = crypto.randomUUID();
    thirdProfileId = crypto.randomUUID();
    await db.insert(schema.account).values([
      { id: accountId, email: `ocr-fallback-${accountId}@example.com`, status: "active" },
      { id: otherAccountId, email: `ocr-fallback-${otherAccountId}@example.com`, status: "active" },
      { id: thirdAccountId, email: `ocr-fallback-${thirdAccountId}@example.com`, status: "active" },
    ]);
    await db.insert(schema.profile).values([
      { id: profileId, ownerAccountId: accountId },
      { id: otherProfileId, ownerAccountId: otherAccountId },
      { id: thirdProfileId, ownerAccountId: thirdAccountId },
    ]);
  });

  afterAll(async () => {
    // Real bug found and fixed during the stabilization audit (2026-08-28):
    // this cleanup had NEVER actually run before (the whole reason these
    // fixtures were never cleaned up is that this describe block had never
    // been executed against a real database at all — SYNC_IT_DATABASE_URL
    // was never set in any prior run). A raw `sql`= ANY(${array})`` does
    // not parameterize a plain JS array correctly against `pg` ("op
    // ANY/ALL (array) requires array on right side") — `inArray(...)` is
    // the correct Drizzle helper for this, used elsewhere in this codebase
    // (lib/sync/server/changes.ts).
    if (productIds.length > 0) {
      await db.delete(schema.medicationIdentifier).where(inArray(schema.medicationIdentifier.catalogProductId, productIds));
      await db.delete(schema.medicationIdentifierSuggestion).where(inArray(schema.medicationIdentifierSuggestion.catalogProductId, productIds));
      await db.delete(schema.medicationCatalogProduct).where(inArray(schema.medicationCatalogProduct.id, productIds));
    }
    await db.delete(schema.profile).where(inArray(schema.profile.id, [profileId, otherProfileId, thirdProfileId]));
    await db.delete(schema.account).where(inArray(schema.account.id, [accountId, otherAccountId, thirdAccountId]));
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

  it("confirmIdentifier creates a USER_CONFIRMED row, and the confirming profile can then resolve it EXACT", async () => {
    const productId = await insertTestProduct("Integration Test Product — User Confirmed");
    const outcome = await provider.confirmIdentifier("GTIN", "08888888888881", productId, profileId);
    expect(outcome).toEqual({ status: "created" });

    const resolution = await provider.lookupByIdentifier("GTIN", "08888888888881", profileId);
    expect(resolution).toMatchObject({ state: "EXACT", evidence: "USER_CONFIRMED" });
  });

  it("without confirmingProfileId, a USER_CONFIRMED-only mapping is VALID_IDENTIFIER_UNRESOLVED (spec §17: never global)", async () => {
    const productId = await insertTestProduct("Integration Test Product — Scope Check A");
    await provider.confirmIdentifier("GTIN", "08888888888882", productId, profileId);

    expect(await provider.lookupByIdentifier("GTIN", "08888888888882")).toEqual({ state: "VALID_IDENTIFIER_UNRESOLVED" });
  });

  it("a DIFFERENT profile never resolves EXACT from another profile's mapping, only gets it as a SUGGESTED to confirm (owner's decision, 2026-10-15)", async () => {
    const productId = await insertTestProduct("Integration Test Product — Scope Check B");
    await provider.confirmIdentifier("GTIN", "08888888888883", productId, profileId);

    const resolution = await provider.lookupByIdentifier("GTIN", "08888888888883", otherProfileId);
    expect(resolution.state).toBe("SUGGESTED");
    if (resolution.state === "SUGGESTED") expect(resolution.product.id).toBe(productId);
    // Never says how many people, nor who.
    expect(Object.keys(resolution).sort()).toEqual(["product", "state"]);
  });

  async function sharedRows(value: string) {
    const s = schema.medicationIdentifierSuggestion;
    return db
      .select({ catalogProductId: s.catalogProductId })
      .from(s)
      .where(sql`${s.identifierType} = 'GTIN' AND ${s.identifierValue} = ${value}`);
  }

  it("each person is shared once: a re-confirmation by the same person adds nothing, a second person adds one", async () => {
    const productId = await insertTestProduct("Integration Test Product — Shared Once");
    await provider.confirmIdentifier("GTIN", "08888888888887", productId, profileId);
    await provider.confirmIdentifier("GTIN", "08888888888887", productId, profileId);
    expect(await sharedRows("08888888888887")).toHaveLength(1);

    await provider.confirmIdentifier("GTIN", "08888888888887", productId, otherProfileId);
    expect(await sharedRows("08888888888887")).toHaveLength(2);

    expect(await provider.lookupByIdentifier("GTIN", "08888888888887", thirdProfileId)).toMatchObject({ state: "SUGGESTED" });
  });

  it("one person answering two different products is not shared as a dispute: others still get their first answer", async () => {
    const first = await insertTestProduct("Integration Test Product — First Answer");
    const second = await insertTestProduct("Integration Test Product — Changed Mind");
    await provider.confirmIdentifier("GTIN", "08888888888891", first, profileId);
    await provider.confirmIdentifier("GTIN", "08888888888891", second, profileId);

    expect(await sharedRows("08888888888891")).toEqual([{ catalogProductId: first }]);
    const resolution = await provider.lookupByIdentifier("GTIN", "08888888888891", otherProfileId);
    expect(resolution.state).toBe("SUGGESTED");
    if (resolution.state === "SUGGESTED") expect(resolution.product.id).toBe(first);
  });

  it("deleting a person's own identifications (as account deletion does) removes what they shared", async () => {
    const productId = await insertTestProduct("Integration Test Product — Deleted Sharer");
    await provider.confirmIdentifier("GTIN", "08888888888892", productId, otherProfileId);
    expect(await sharedRows("08888888888892")).toHaveLength(1);

    await withProfileScope(otherProfileId, (scopedDb) => [scopedDb.delete(schema.medicationIdentifier).where(eq(schema.medicationIdentifier.profileId, otherProfileId))] as const, { db });

    expect(await sharedRows("08888888888892")).toHaveLength(0);
    expect(await provider.lookupByIdentifier("GTIN", "08888888888892", thirdProfileId)).toEqual({ state: "VALID_IDENTIFIER_UNRESOLVED" });
  });

  it("a disputed package (two people, two different products) suggests nothing to anyone else", async () => {
    const productA = await insertTestProduct("Integration Test Product — Disputed A");
    const productB = await insertTestProduct("Integration Test Product — Disputed B");
    await provider.confirmIdentifier("GTIN", "08888888888888", productA, profileId);
    await provider.confirmIdentifier("GTIN", "08888888888888", productB, otherProfileId);

    expect(await provider.lookupByIdentifier("GTIN", "08888888888888", thirdProfileId)).toEqual({ state: "VALID_IDENTIFIER_UNRESOLVED" });
  });

  it("a person's own identification outranks the shared suggestion", async () => {
    const othersProduct = await insertTestProduct("Integration Test Product — Others' Pick");
    const ownProduct = await insertTestProduct("Integration Test Product — Own Pick");
    await provider.confirmIdentifier("GTIN", "08888888888889", othersProduct, profileId);
    await provider.confirmIdentifier("GTIN", "08888888888889", othersProduct, otherProfileId);
    await provider.confirmIdentifier("GTIN", "08888888888889", ownProduct, thirdProfileId);

    const resolution = await provider.lookupByIdentifier("GTIN", "08888888888889", thirdProfileId);
    expect(resolution).toMatchObject({ state: "EXACT", evidence: "USER_CONFIRMED" });
    if (resolution.state === "EXACT") expect(resolution.product.id).toBe(ownProduct);
  });

  it("an official mapping outranks a shared suggestion", async () => {
    const official = await insertTestProduct("Integration Test Product — Official Over Suggestion");
    const suggested = await insertTestProduct("Integration Test Product — Suggestion Under Official");
    await db.insert(schema.medicationIdentifier).values({ catalogProductId: official, identifierType: "GTIN", identifierValue: "08888888888890", source: "integration-test" });
    await provider.confirmIdentifier("GTIN", "08888888888890", suggested, profileId);

    const resolution = await provider.lookupByIdentifier("GTIN", "08888888888890", otherProfileId);
    expect(resolution).toMatchObject({ state: "EXACT", evidence: "AUTHORITATIVE" });
    if (resolution.state === "EXACT") expect(resolution.product.id).toBe(official);
  });

  it("re-confirming the SAME product for the SAME profile/gtin is idempotent — already_confirmed, no duplicate row", async () => {
    const productId = await insertTestProduct("Integration Test Product — Idempotent Confirm");
    const first = await provider.confirmIdentifier("GTIN", "08888888888884", productId, profileId);
    const second = await provider.confirmIdentifier("GTIN", "08888888888884", productId, profileId);
    expect(first).toEqual({ status: "created" });
    expect(second).toEqual({ status: "already_confirmed" });
  });

  it("confirming a DIFFERENT product for a gtin this profile already confirmed preserves BOTH rows and reports the conflict (spec §19)", async () => {
    const productA = await insertTestProduct("Integration Test Product — Own Conflict A");
    const productB = await insertTestProduct("Integration Test Product — Own Conflict B");
    const first = await provider.confirmIdentifier("GTIN", "08888888888885", productA, profileId);
    const second = await provider.confirmIdentifier("GTIN", "08888888888885", productB, profileId);
    expect(first).toEqual({ status: "created" });
    expect(second).toEqual({ status: "conflict_with_own_prior_mapping" });

    const resolution = await provider.lookupByIdentifier("GTIN", "08888888888885", profileId);
    expect(resolution.state).toBe("CONFLICT");
    if (resolution.state === "CONFLICT") {
      expect(resolution.catalogProductIds).toEqual(expect.arrayContaining([productA, productB]));
    }
  });

  it("AUTHORITATIVE always wins over this profile's own USER_CONFIRMED mapping for the same identifier (spec §20)", async () => {
    const authoritativeProduct = await insertTestProduct("Integration Test Product — Authoritative Wins");
    const userConfirmedProduct = await insertTestProduct("Integration Test Product — Shadowed User Mapping");
    await db.insert(schema.medicationIdentifier).values({
      catalogProductId: authoritativeProduct,
      identifierType: "GTIN",
      identifierValue: "08888888888886",
      source: "integration-test",
    });
    await provider.confirmIdentifier("GTIN", "08888888888886", userConfirmedProduct, profileId);

    const resolution = await provider.lookupByIdentifier("GTIN", "08888888888886", profileId);
    expect(resolution).toMatchObject({ state: "EXACT", evidence: "AUTHORITATIVE" });
    if (resolution.state === "EXACT") expect(resolution.product.id).toBe(authoritativeProduct);
  });
});
