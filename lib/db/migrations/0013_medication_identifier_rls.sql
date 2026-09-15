-- Closes the RLS gap flagged by the 2026-09-15 security review:
-- `medication_identifier` (added by migration 0010, `evidence_type`/
-- `profile_id` added by migration 0011) was the one profile-owned table
-- with no RLS at all, breaking the invariant migration 0001's header
-- documents ("RLS is applied to every profile-owned domain/sync table per
-- Phase 2 §0") — it simply didn't exist yet when 0001 was written, and
-- nothing added RLS for it afterward.
--
-- ONE policy, not a per-evidence-type pair, because AUTHORITATIVE-vs-
-- everything-else is already fully captured by `profile_id` itself
-- (`chk_medication_identifier_profile_scope`, migration 0011):
-- AUTHORITATIVE rows always have `profile_id IS NULL` (server-owned
-- reference data, no per-profile concept applies), and every other
-- evidence_type — USER_CONFIRMED today; VERIFIED_PHYSICAL_OBSERVATION/
-- COMMUNITY_CONFIRMED reserved and unimplemented, see
-- `lib/domain/catalog.ts`'s `IdentifierEvidence` doc — always has
-- `profile_id IS NOT NULL` and is treated as private to that one profile.
-- COMMUNITY_CONFIRMED's name suggests cross-profile visibility might be
-- the eventual intent, but no code reads, writes, or even defines query
-- semantics for it yet, so scoping it the same as USER_CONFIRMED
-- (owner-only) is the conservative default consistent with today's actual
-- design principle ("never global from one user's confirmation",
-- migration 0011's own `profile_id` column comment) — a future
-- aggregation feature that genuinely wants cross-profile reads gets its
-- own reviewed migration and policy change, not an assumption baked in
-- here.
--
-- The `profile_id IS NULL` branch is intentionally NOT gated on
-- `app.current_profile_id` — it must stay true unconditionally so every
-- caller that only ever touches AUTHORITATIVE rows (the shared/global
-- lookups in `PostgresCatalogProvider.lookupByIdentifier`'s first query,
-- `generateOfflineIndex`, and the `scripts/import/` bulk loaders) keeps
-- working over the plain unscoped connection, exactly like
-- `medication_catalog_product`'s own no-RLS design (`lib/db/schema.ts`
-- §2.4). Without this unconditional branch, `FORCE ROW LEVEL SECURITY`
-- below would make those global reads silently return zero rows the
-- moment `app.current_profile_id` isn't set — a worse, silent regression
-- for exactly the callers this migration must not break. Only reads/
-- writes of a non-null `profile_id` row require `withProfileScope` — see
-- `lib/catalog/server/postgres-provider.ts`'s `lookupByIdentifier`/
-- `confirmIdentifier`, updated in the same change as this migration.
ALTER TABLE "medication_identifier" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "medication_identifier" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_medication_identifier" ON "medication_identifier" FOR ALL
  USING ("profile_id" IS NULL OR "profile_id" = current_setting('app.current_profile_id', true)::uuid)
  WITH CHECK ("profile_id" IS NULL OR "profile_id" = current_setting('app.current_profile_id', true)::uuid);
