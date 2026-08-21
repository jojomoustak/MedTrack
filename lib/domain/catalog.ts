/**
 * `MedicationCatalogProduct` domain type (Phase 2 §2.4, ADR-004) — reused
 * directly from the Drizzle schema (`$inferSelect`) rather than
 * hand-duplicated, since this entity is server-authoritative, read-only
 * reference data with no client mutation/outbox path (unlike
 * `UserPreferences`/`PurchaseList`/`UserMedication`, which need their own
 * hand-typed domain records precisely because they cross the
 * client/server sync boundary — see `lib/domain/entities.ts`,
 * `lib/domain/user-medication.ts`). Type-only import — this never pulls
 * `drizzle-orm`/`pg` code into the client bundle, only erased-at-build
 * type information.
 */
import type * as schema from "@/lib/db/schema";

export type CatalogProduct = typeof schema.medicationCatalogProduct.$inferSelect;

/**
 * The MVP catalog has no verified external data source (Phase 1 §8: EOF/
 * EMA are unverified/not integrated for this project today). Every row
 * seeded for Phase 6 carries this exact marker in `regulatory_source` so
 * it can never be mistaken for real coverage of the Greek medication
 * market — see `lib/db/seed.ts`.
 */
export const SEED_PLACEHOLDER_SOURCE = "seed-placeholder-not-verified";

export interface CatalogSearchOptions {
  limit?: number;
  offset?: number;
}

/**
 * Phase 1 §8's provider abstraction — no implementation ships until a
 * real source is classified `VERIFIED AVAILABLE`; this MVP implementation
 * (`lib/catalog/server/postgres-provider.ts`) is backed by the
 * seed-placeholder set only.
 */
export interface MedicationCatalogProvider {
  /** Accent/diacritic-insensitive Greek text search (Phase 3 §2.4) against name/manufacturer/active ingredient. */
  search(query: string, options?: CatalogSearchOptions): Promise<CatalogProduct[]>;
  /** GTIN exact-match lookup — the scan flow's eventual entry point (Phase 1 §7); implemented now since it shares the same table/provider, even though nothing calls it until Phase 7-8 builds scanning. */
  lookupByGtin(gtin: string): Promise<CatalogProduct | null>;
}
