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

/**
 * Marks a catalog row imported from a real official EOF/Ministry of
 * Health price bulletin (`scripts/import/`, `data/README.md`) — real
 * government data, unlike `SEED_PLACEHOLDER_SOURCE`, but explicitly
 * DEV-ONLY: production redistribution isn't yet approved (licensing terms
 * are contradictory — medication-resolution-architecture.md §2.3/§12 item
 * 7). Never conflate the two constants; a row's source must always say
 * honestly which kind of data it actually is.
 */
export const EOF_DEV_IMPORT_SOURCE = "eof-mysyfa-bulletin-dev-only-not-for-production";

export interface CatalogSearchOptions {
  limit?: number;
  offset?: number;
}

/** Mirrors `medication_identifier.identifier_type`'s CHECK constraint exactly (GTIN-resolution task spec §1). */
export type CatalogIdentifierType = "EOF_CODE" | "NHRN" | "EAN13" | "GTIN";

/**
 * How confidently a `medication_identifier` row's mapping is known to be
 * correct (OCR-fallback task spec §13). Only `AUTHORITATIVE` and
 * `USER_CONFIRMED` are ever actually written by this codebase today — the
 * other two are reserved so a future, separately-reviewed aggregation
 * system (spec §18: "design the schema so future aggregation is possible
 * without implementing unsafe global learning now") has somewhere to write
 * without a type change, not a promise that they're implemented:
 *
 * - `AUTHORITATIVE`: from a real official source (EOF/Ministry import
 *   today; HMVO or another verified GTIN↔NHRN source in the future —
 *   medication-resolution-architecture.md §20).
 * - `USER_CONFIRMED`: one specific profile explicitly confirmed an OCR (or
 *   manual-search) candidate for this GTIN (spec §12). Never labeled
 *   AUTHORITATIVE, never promoted to it automatically (spec §13/§18).
 * - `VERIFIED_PHYSICAL_OBSERVATION` / `COMMUNITY_CONFIRMED`: reserved,
 *   unimplemented (spec §14/§18).
 */
export type IdentifierEvidence = "AUTHORITATIVE" | "USER_CONFIRMED" | "VERIFIED_PHYSICAL_OBSERVATION" | "COMMUNITY_CONFIRMED";

/**
 * The three, and only three, outcomes an identifier lookup can produce
 * (spec §11/§19) — deliberately not a bare `CatalogProduct | null`, which
 * cannot distinguish "no mapping exists yet" from "this identifier is
 * genuinely ambiguous, two different products claim it." Never resolved
 * to a fourth, "best guess" outcome under any circumstance:
 *
 * - `EXACT`: exactly one product claims this identifier — safe to resolve
 *   to. `evidence` says WHY (an official mapping, or this profile's own
 *   past confirmation, per the precedence order in
 *   medication-resolution-architecture.md §21 — `AUTHORITATIVE` always
 *   outranks `USER_CONFIRMED` when both exist).
 * - `CONFLICT`: two or more DIFFERENT products claim the same identifier
 *   value (from possibly-disagreeing sources, or from this same profile
 *   confirming two different OCR candidates for the same GTIN at
 *   different times, OCR-fallback task spec §19). Never silently picked
 *   between — the caller must show this as unresolved/ambiguous, same as
 *   the broader multi-provider `CONFLICT` state in
 *   medication-resolution-architecture.md §3, not auto-resolved here either.
 * - `VALID_IDENTIFIER_UNRESOLVED`: the identifier itself is well-formed
 *   (already validated by the caller — e.g. a real GS1 GTIN successfully
 *   parsed from a DataMatrix scan), but no authoritative OR this-profile's-
 *   own-confirmed mapping to any catalog product exists yet (spec
 *   §7/§11/§14) — distinct from an invalid/malformed scan, which never
 *   reaches this lookup at all.
 */
export type IdentifierResolution =
  | { state: "EXACT"; product: CatalogProduct; evidence: IdentifierEvidence }
  | { state: "CONFLICT"; catalogProductIds: readonly string[] }
  | { state: "VALID_IDENTIFIER_UNRESOLVED" };

/** Outcome of `MedicationCatalogProvider.confirmIdentifier` (OCR-fallback task spec §12/§19). */
export type ConfirmIdentifierOutcome =
  /** A new `USER_CONFIRMED` row was written. */
  | { status: "created" }
  /** This exact profile already confirmed this exact GTIN → product pair before — no-op, not an error (spec §15's "second scan" case is a read, not a re-confirm, but a user re-running confirmation for any reason must not create a duplicate row). */
  | { status: "already_confirmed" }
  /** This profile previously confirmed this same GTIN for a DIFFERENT product — both rows are preserved (never silently overwritten, spec §19); the caller should treat the identifier as `CONFLICT` on next lookup. */
  | { status: "conflict_with_own_prior_mapping" };

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
  /**
   * EOF product code exact-match lookup — Path A's resolution step
   * (medication-resolution-architecture.md §2.5): the 9-digit code a Greek
   * national `280`-prefix EAN-13 barcode decodes to
   * (`lib/domain/greek-national-barcode.ts`), looked up against whatever
   * `medication_catalog_product` rows a development import has populated.
   * `eofCode` must be passed exactly as decoded (leading zeros preserved,
   * never coerced through a number).
   */
  lookupByEofCode(eofCode: string): Promise<CatalogProduct | null>;
  /**
   * Multi-identifier lookup against `medication_identifier` (GTIN-
   * resolution task spec §1/§3/§19) — the real GS1 DataMatrix resolution
   * path. Distinct from `lookupByGtin` above: that method queries the
   * single, always-null-for-real-data `medication_catalog_product.gtin`
   * column (kept for backward compatibility, never removed); this one
   * queries the new multi-row identifier table, so a product with several
   * valid GTINs (spec §5) or a genuine cross-source conflict (spec §19)
   * resolves correctly instead of silently picking one row. `value` must
   * be passed exactly as decoded/normalized (leading zeros preserved) —
   * never re-derived or fuzzy-matched (spec §11).
   *
   * `confirmingProfileId`, when supplied, scopes which `USER_CONFIRMED`
   * rows are considered in addition to every `AUTHORITATIVE` row
   * (OCR-fallback task spec §17: a profile's own confirmations are never
   * visible to, or resolved for, any other profile — see
   * `medication-resolution-architecture.md` §21 for the full precedence
   * algorithm). Omitted entirely, only `AUTHORITATIVE` rows are considered
   * (the GTIN-resolution task's original behavior, unchanged).
   */
  lookupByIdentifier(type: CatalogIdentifierType, value: string, confirmingProfileId?: string): Promise<IdentifierResolution>;
  /**
   * Records one profile's explicit confirmation of an OCR (or manual)
   * candidate as a `USER_CONFIRMED` identifier mapping (OCR-fallback task
   * spec §12/§14/§19). Never called except after real, explicit user
   * confirmation in the UI — never from OCR output alone (spec §12: "Never
   * learn from OCR output alone").
   */
  confirmIdentifier(type: CatalogIdentifierType, value: string, catalogProductId: string, profileId: string): Promise<ConfirmIdentifierOutcome>;
}
