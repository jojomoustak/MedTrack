-- Evidence/provenance for `medication_identifier` (OCR-fallback task spec
-- §12-§20): every pre-0011 row is an official AUTHORITATIVE mapping, so
-- the new column's DEFAULT backfills them all correctly with no data
-- migration needed. `profile_id` scopes a USER_CONFIRMED row to the one
-- profile that confirmed it (spec §17: never global from one user).
ALTER TABLE "medication_identifier"
  ADD COLUMN "evidence_type" text NOT NULL DEFAULT 'AUTHORITATIVE',
  ADD COLUMN "profile_id" uuid REFERENCES "profile"("id");

ALTER TABLE "medication_identifier"
  ADD CONSTRAINT "chk_medication_identifier_evidence_type"
    CHECK ("evidence_type" IN ('AUTHORITATIVE','USER_CONFIRMED','VERIFIED_PHYSICAL_OBSERVATION','COMMUNITY_CONFIRMED')),
  ADD CONSTRAINT "chk_medication_identifier_profile_scope"
    CHECK (("evidence_type" = 'AUTHORITATIVE' AND "profile_id" IS NULL) OR ("evidence_type" <> 'AUTHORITATIVE' AND "profile_id" IS NOT NULL));

-- Replace the original single unique index with two partial ones scoped by
-- evidence_type. Postgres treats NULL <> NULL for uniqueness purposes, so
-- simply adding profile_id to the old index would have silently stopped
-- deduping AUTHORITATIVE re-imports (every AUTHORITATIVE row has
-- profile_id = NULL). Splitting by evidence_type keeps the ORIGINAL
-- "no dupe import" guarantee exactly as strict as it was, and adds an
-- equivalent "no dupe confirmation" guarantee for USER_CONFIRMED rows.
DROP INDEX "uq_medication_identifier_no_dupe_import";

CREATE UNIQUE INDEX "uq_medication_identifier_authoritative_no_dupe"
  ON "medication_identifier" ("catalog_product_id", "identifier_type", "identifier_value", "source")
  WHERE "evidence_type" = 'AUTHORITATIVE';

CREATE UNIQUE INDEX "uq_medication_identifier_user_confirmed_no_dupe"
  ON "medication_identifier" ("catalog_product_id", "identifier_type", "identifier_value", "profile_id")
  WHERE "evidence_type" = 'USER_CONFIRMED';
