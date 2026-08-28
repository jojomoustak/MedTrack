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
import { logger } from "@/lib/logging/logger";
import type {
  CatalogIdentifierType,
  CatalogProduct,
  CatalogSearchOptions,
  ConfirmIdentifierOutcome,
  IdentifierResolution,
  MedicationCatalogProvider,
} from "@/lib/domain/catalog";

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

  /**
   * Precedence (OCR-fallback task spec §20, full reasoning in
   * `medication-resolution-architecture.md` §21): AUTHORITATIVE rows are
   * checked first and, if they resolve to a single product, ALWAYS win —
   * regardless of what any USER_CONFIRMED row for the same identifier
   * says (logged as a "shadowed" mismatch for diagnostics, never
   * surfaced as a distinct API state — the caller only ever needs to know
   * the winning answer). Only when there is NO authoritative match at all
   * does a requesting profile's own USER_CONFIRMED row(s) get consulted.
   * `confirmingProfileId` omitted entirely means "authoritative-only" —
   * the exact behavior this method had before this task (every existing
   * caller that doesn't pass it keeps working unchanged).
   */
  async lookupByIdentifier(type: CatalogIdentifierType, value: string, confirmingProfileId?: string): Promise<IdentifierResolution> {
    const { medicationIdentifier: mi } = schema;

    const authoritativeMatches = await this.db
      .selectDistinct({ catalogProductId: mi.catalogProductId })
      .from(mi)
      .where(sql`${mi.identifierType} = ${type} AND ${mi.identifierValue} = ${value} AND ${mi.evidenceType} = 'AUTHORITATIVE'`);

    if (authoritativeMatches.length > 1) {
      // Two or more DIFFERENT products both authoritatively claim this
      // identifier — never silently pick one (spec §19).
      return { state: "CONFLICT", catalogProductIds: authoritativeMatches.map((m) => m.catalogProductId) };
    }

    if (authoritativeMatches.length === 1) {
      if (confirmingProfileId) {
        const userMatches = await this.db
          .selectDistinct({ catalogProductId: mi.catalogProductId })
          .from(mi)
          .where(
            sql`${mi.identifierType} = ${type} AND ${mi.identifierValue} = ${value} AND ${mi.evidenceType} = 'USER_CONFIRMED' AND ${mi.profileId} = ${confirmingProfileId}`,
          );
        if (userMatches.some((m) => m.catalogProductId !== authoritativeMatches[0].catalogProductId)) {
          logger.warn("catalog.identifier.authoritative_shadows_user_confirmed", { type, confirmingProfileId });
        }
      }
      return this.loadExact(authoritativeMatches[0].catalogProductId, "AUTHORITATIVE");
    }

    if (!confirmingProfileId) return { state: "VALID_IDENTIFIER_UNRESOLVED" };

    const userMatches = await this.db
      .selectDistinct({ catalogProductId: mi.catalogProductId })
      .from(mi)
      .where(
        sql`${mi.identifierType} = ${type} AND ${mi.identifierValue} = ${value} AND ${mi.evidenceType} = 'USER_CONFIRMED' AND ${mi.profileId} = ${confirmingProfileId}`,
      );

    if (userMatches.length === 0) return { state: "VALID_IDENTIFIER_UNRESOLVED" };
    if (userMatches.length > 1) {
      // This profile confirmed the SAME identifier for two DIFFERENT
      // products at different times (spec §19's MAPPING_CONFLICT case) —
      // both rows are preserved, never silently overwritten; surfaced the
      // same way a cross-source AUTHORITATIVE conflict is.
      return { state: "CONFLICT", catalogProductIds: userMatches.map((m) => m.catalogProductId) };
    }
    return this.loadExact(userMatches[0].catalogProductId, "USER_CONFIRMED");
  }

  private async loadExact(catalogProductId: string, evidence: "AUTHORITATIVE" | "USER_CONFIRMED"): Promise<IdentifierResolution> {
    const [product] = await this.db.select().from(schema.medicationCatalogProduct).where(sql`${schema.medicationCatalogProduct.id} = ${catalogProductId}`).limit(1);
    if (!product) return { state: "VALID_IDENTIFIER_UNRESOLVED" }; // dangling identifier row (should not happen; FK-enforced) — degrade safely rather than throw
    return { state: "EXACT", product, evidence };
  }

  /**
   * Idempotent-by-natural-key write (OCR-fallback task spec §12/§15/§19):
   * `ON CONFLICT DO NOTHING` against the same partial unique index
   * (`uq_medication_identifier_user_confirmed_no_dupe`) that makes a
   * re-confirmation of the SAME gtin→product pair a true no-op, while a
   * confirmation of a DIFFERENT product for a gtin this profile already
   * confirmed inserts a genuinely new row (different `catalog_product_id`
   * is outside that index's key) — which is exactly what should happen:
   * both rows are preserved, and `lookupByIdentifier` above will then
   * correctly report `CONFLICT` for this profile on the next lookup,
   * never silently overwritten.
   */
  async confirmIdentifier(type: CatalogIdentifierType, value: string, catalogProductId: string, profileId: string): Promise<ConfirmIdentifierOutcome> {
    const { medicationIdentifier: mi } = schema;

    const existingForThisProduct = await this.db
      .select({ id: mi.id })
      .from(mi)
      .where(
        sql`${mi.identifierType} = ${type} AND ${mi.identifierValue} = ${value} AND ${mi.evidenceType} = 'USER_CONFIRMED' AND ${mi.profileId} = ${profileId} AND ${mi.catalogProductId} = ${catalogProductId}`,
      )
      .limit(1);
    if (existingForThisProduct.length > 0) return { status: "already_confirmed" };

    const conflictingForOtherProduct = await this.db
      .select({ id: mi.id })
      .from(mi)
      .where(
        sql`${mi.identifierType} = ${type} AND ${mi.identifierValue} = ${value} AND ${mi.evidenceType} = 'USER_CONFIRMED' AND ${mi.profileId} = ${profileId} AND ${mi.catalogProductId} <> ${catalogProductId}`,
      )
      .limit(1);

    await this.db
      .insert(mi)
      .values({ catalogProductId, identifierType: type, identifierValue: value, source: "user_confirmed", evidenceType: "USER_CONFIRMED", profileId })
      // `where` (not `target` alone) is required here, exactly like
      // `upsert-catalog-records.ts`'s `onConflictDoUpdate({ targetWhere })`
      // fix earlier in this project: the arbiter is the PARTIAL index
      // `uq_medication_identifier_user_confirmed_no_dupe`
      // (`WHERE evidence_type = 'USER_CONFIRMED'`), and Postgres only
      // matches an `ON CONFLICT` clause to a partial index when the
      // clause's own predicate is provided and syntactically implies it.
      .onConflictDoNothing({
        target: [mi.catalogProductId, mi.identifierType, mi.identifierValue, mi.profileId],
        where: sql`${mi.evidenceType} = 'USER_CONFIRMED'`,
      });

    return conflictingForOtherProduct.length > 0 ? { status: "conflict_with_own_prior_mapping" } : { status: "created" };
  }
}
