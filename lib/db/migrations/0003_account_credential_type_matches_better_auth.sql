ALTER TABLE "account_credential" DROP CONSTRAINT "chk_credential_type";--> statement-breakpoint
ALTER TABLE "account_credential" ALTER COLUMN "credential_type" SET DEFAULT 'credential';--> statement-breakpoint
ALTER TABLE "account_credential" ADD CONSTRAINT "chk_credential_type" CHECK ("account_credential"."credential_type" IN ('credential','password'));