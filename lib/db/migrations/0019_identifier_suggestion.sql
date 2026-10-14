-- Shared package suggestions (owner's decision, 2026-10-15: "share as suggestions").
-- See lib/db/schema.ts's medicationIdentifierSuggestion doc for the rules.
--
-- Forward: one new table, additive; nothing existing changes. (drizzle-kit also emitted
-- auth_rate_limit/error_log/account.email_verified/uq_account_verification_token_hash
-- statements here, because the hand-written migrations 0014-0017 never updated the
-- snapshots; those are already applied, so they were removed from this file. The 0019
-- snapshot now matches the full schema.)
-- Backfill: none, deliberately. Existing USER_CONFIRMED rows were confirmed under the
-- "only for you" rule; they are not shared after the fact.
-- Deletion: each row cascades from the person's own medication_identifier row, which
-- account deletion already removes, so a deleted person's shared copy goes with it.
-- Rollback: DROP TABLE "medication_identifier_suggestion"; (the app treats a missing
-- table as "no suggestions", see PostgresCatalogProvider).
CREATE TABLE "medication_identifier_suggestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier_type" text NOT NULL,
	"identifier_value" text NOT NULL,
	"catalog_product_id" uuid NOT NULL,
	"medication_identifier_id" uuid NOT NULL,
	CONSTRAINT "chk_medication_identifier_suggestion_type" CHECK ("medication_identifier_suggestion"."identifier_type" IN ('EOF_CODE','NHRN','EAN13','GTIN'))
);
--> statement-breakpoint
ALTER TABLE "medication_identifier_suggestion" ADD CONSTRAINT "fk_identifier_suggestion_product" FOREIGN KEY ("catalog_product_id") REFERENCES "public"."medication_catalog_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_identifier_suggestion" ADD CONSTRAINT "fk_identifier_suggestion_source" FOREIGN KEY ("medication_identifier_id") REFERENCES "public"."medication_identifier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_medication_identifier_suggestion_lookup" ON "medication_identifier_suggestion" USING btree ("identifier_type","identifier_value");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_medication_identifier_suggestion_source" ON "medication_identifier_suggestion" USING btree ("medication_identifier_id");
