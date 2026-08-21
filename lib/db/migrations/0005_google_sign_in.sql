-- ADR-003 addendum (2026-08-21), "Sign in with Google", A.2. Extends
-- account_credential in place (Better Auth's single `account` model = one
-- row per auth method per account) rather than a new table — see the
-- addendum's A.1 for why a second table doesn't work with Better Auth's
-- adapter. No production data exists yet, so this is a normal additive
-- migration, not a backfill. `oauth_*` columns exist only because Better
-- Auth's adapter needs somewhere to write; they are kept always-NULL by
-- application logic (A.3, `lib/auth/config.ts`'s token-stripping hooks).
ALTER TABLE "account_credential" DROP CONSTRAINT "chk_credential_type";--> statement-breakpoint
ALTER TABLE "account_credential" ADD COLUMN "linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_credential" ADD COLUMN "email_at_link_time" text;--> statement-breakpoint
ALTER TABLE "account_credential" ADD COLUMN "oauth_access_token" text;--> statement-breakpoint
ALTER TABLE "account_credential" ADD COLUMN "oauth_refresh_token" text;--> statement-breakpoint
ALTER TABLE "account_credential" ADD COLUMN "oauth_id_token" text;--> statement-breakpoint
ALTER TABLE "account_credential" ADD COLUMN "oauth_scope" text;--> statement-breakpoint
ALTER TABLE "account_credential" ADD COLUMN "oauth_access_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_credential" ADD COLUMN "oauth_refresh_token_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_account_credential_provider_identity" ON "account_credential" USING btree ("credential_type","provider_account_id") WHERE "account_credential"."provider_account_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "account_credential" ADD CONSTRAINT "chk_credential_type" CHECK ("account_credential"."credential_type" IN ('credential','password','google'));