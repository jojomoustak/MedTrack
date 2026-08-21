-- Found via a REAL Google OAuth click-through (2026-08-21), not inspection:
-- clicking "Sign in with Google" 500'd with `null value in column
-- "account_id"` because Better Auth's OAuth-initiation write
-- (`internalAdapter.createVerificationValue`, see `state.mjs`) has no
-- account to attach yet at that point in the flow — it's what the later
-- callback resolves an account FROM. Same investigation found
-- `chk_verification_purpose` was ALSO wrong for real Better Auth output
-- (password-reset uses `reset-password:<token>`, OAuth state uses a bare
-- random string — never the literal `'email_verify'`/`'password_reset'`
-- values the check assumed), which would have broken password-reset too
-- the first time that unbuilt feature was ever exercised. No production
-- data exists in this table yet, so both are plain additive/relaxing
-- changes. See `lib/db/schema.ts`'s `accountVerification` comment.
ALTER TABLE "account_verification" DROP CONSTRAINT "chk_verification_purpose";--> statement-breakpoint
ALTER TABLE "account_verification" ALTER COLUMN "account_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_account_verification_identifier" ON "account_verification" USING btree ("purpose","created_at" DESC NULLS LAST);