-- Extensions this schema depends on (Phase 2 "Assumptions"): pgcrypto for
-- gen_random_uuid(), citext for case-insensitive email, unaccent + pg_trgm
-- for Greek-language-friendly catalog search (risk R6). Must run before any
-- table below that uses these types/functions — hand-prepended here rather
-- than expressed in lib/db/schema.ts, since Drizzle has no first-class
-- "CREATE EXTENSION" builder.
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

-- Postgres requires a GENERATED ALWAYS AS expression to be provably
-- IMMUTABLE; the extension's own `unaccent()` is only STABLE, so
-- medication_catalog_product.name_normalized (below) can't call it
-- directly — confirmed by actually running this migration, not assumed.
-- This is the standard documented workaround: wrap it, pinned to the
-- default 'unaccent' dictionary, in a function explicitly marked
-- IMMUTABLE.
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text AS $$
  SELECT unaccent('unaccent', $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;--> statement-breakpoint

CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"email_verified_at" timestamp with time zone,
	"display_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_account_status" CHECK ("account"."status" IN ('active','suspended','pending_deletion','deleted'))
);
--> statement-breakpoint
CREATE TABLE "account_credential" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"credential_type" text DEFAULT 'password' NOT NULL,
	"password_hash" text,
	"hash_algorithm" text,
	"hash_params" jsonb,
	"password_updated_at" timestamp with time zone,
	"failed_login_count" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_credential_type" CHECK ("account_credential"."credential_type" IN ('password')),
	CONSTRAINT "chk_credential_hash_algorithm" CHECK ("account_credential"."hash_algorithm" IS NULL OR "account_credential"."hash_algorithm" IN ('argon2id'))
);
--> statement-breakpoint
CREATE TABLE "account_deletion_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id_hash" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"method" text NOT NULL,
	"outcome" text DEFAULT 'in_progress' NOT NULL,
	"actor" text,
	CONSTRAINT "chk_deletion_audit_method" CHECK ("account_deletion_audit"."method" IN ('user_initiated','admin','legal_request')),
	CONSTRAINT "chk_deletion_audit_outcome" CHECK ("account_deletion_audit"."outcome" IN ('in_progress','completed','failed'))
);
--> statement-breakpoint
CREATE TABLE "account_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"ip_hash" text,
	"user_agent" text,
	"device_label" text,
	CONSTRAINT "chk_session_revoked_reason" CHECK ("account_session"."revoked_reason" IS NULL OR "account_session"."revoked_reason" IN ('user_logout','logout_all_devices','password_changed','admin_revoked','account_deleted'))
);
--> statement-breakpoint
CREATE TABLE "account_verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_verification_purpose" CHECK ("account_verification"."purpose" IN ('email_verify','password_reset'))
);
--> statement-breakpoint
CREATE TABLE "deleted_profile_registry" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"account_id_hash" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "chk_deleted_registry_reason" CHECK ("deleted_profile_registry"."reason" IN ('user_requested','account_deletion'))
);
--> statement-breakpoint
CREATE TABLE "dose_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"user_medication_id" uuid NOT NULL,
	"schedule_id" uuid,
	"scheduled_at" timestamp with time zone,
	"reminder_at" timestamp with time zone,
	"taken_at" timestamp with time zone,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"quantity_value" numeric(12, 3),
	"quantity_unit" text,
	"source" text NOT NULL,
	"snooze_count" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_mutation_id" uuid NOT NULL,
	CONSTRAINT "chk_dose_event_status" CHECK ("dose_event"."status" IN ('scheduled','reminded','taken','taken_late','snoozed','skipped','missed','cancelled')),
	CONSTRAINT "chk_dose_event_source" CHECK ("dose_event"."source" IN ('schedule_generated','manual_prn','manual_backfill')),
	CONSTRAINT "chk_taken_has_timestamp" CHECK ("dose_event"."status" <> 'taken' OR "dose_event"."taken_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "favorite" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"user_medication_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_updated_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"client_mutation_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_catalog_product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gtin" text,
	"name" text NOT NULL,
	"name_normalized" text GENERATED ALWAYS AS (lower(immutable_unaccent(name))) STORED,
	"manufacturer" text,
	"active_ingredient" text,
	"strength_value" numeric(12, 3),
	"strength_unit" text,
	"form" text,
	"pack_size_value" numeric(12, 3),
	"pack_size_unit" text,
	"regulatory_source" text NOT NULL,
	"source_version" text,
	"source_last_updated" timestamp with time zone,
	"lifecycle_state" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_catalog_form" CHECK ("medication_catalog_product"."form" IS NULL OR "medication_catalog_product"."form" IN ('tablet','capsule','ml','mg','mcg','g','dose','spray','drop','sachet','patch','injection','other')),
	CONSTRAINT "chk_catalog_lifecycle_state" CHECK ("medication_catalog_product"."lifecycle_state" IN ('active','discontinued','recalled'))
);
--> statement-breakpoint
CREATE TABLE "medication_inventory_transaction" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"user_medication_id" uuid NOT NULL,
	"package_id" uuid,
	"transaction_type" text NOT NULL,
	"quantity_delta" numeric(12, 3) NOT NULL,
	"quantity_unit" text NOT NULL,
	"dose_event_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"note" text,
	"client_mutation_id" uuid NOT NULL,
	CONSTRAINT "chk_inventory_txn_type" CHECK ("medication_inventory_transaction"."transaction_type" IN ('package_opened','dose_taken','refill','manual_correction','package_discarded','dose_reversed')),
	CONSTRAINT "chk_inventory_txn_quantity_delta_nonzero" CHECK ("medication_inventory_transaction"."quantity_delta" <> 0),
	CONSTRAINT "chk_inventory_txn_source" CHECK ("medication_inventory_transaction"."source" IN ('user','system','sync_recovery')),
	CONSTRAINT "chk_dose_txn_has_event" CHECK (("medication_inventory_transaction"."transaction_type" IN ('dose_taken','dose_reversed') AND "medication_inventory_transaction"."dose_event_id" IS NOT NULL) OR
          ("medication_inventory_transaction"."transaction_type" NOT IN ('dose_taken','dose_reversed') AND "medication_inventory_transaction"."dose_event_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "medication_package" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"user_medication_id" uuid NOT NULL,
	"source" text NOT NULL,
	"gtin" text,
	"batch_number" text,
	"serial_number" text,
	"expiry_date" date,
	"received_date" date DEFAULT CURRENT_DATE NOT NULL,
	"initial_quantity_value" numeric(12, 3) NOT NULL,
	"quantity_unit" text NOT NULL,
	"status" text DEFAULT 'unopened' NOT NULL,
	"opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"client_mutation_id" uuid NOT NULL,
	CONSTRAINT "chk_package_source" CHECK ("medication_package"."source" IN ('scan','manual')),
	CONSTRAINT "chk_package_status" CHECK ("medication_package"."status" IN ('unopened','opened','depleted','discarded','expired')),
	CONSTRAINT "chk_package_initial_quantity_positive" CHECK ("medication_package"."initial_quantity_value" > 0)
);
--> statement-breakpoint
CREATE TABLE "medication_schedule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"user_medication_id" uuid NOT NULL,
	"schedule_kind" text NOT NULL,
	"time_anchor" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"timezone" text DEFAULT 'Europe/Athens' NOT NULL,
	"dose_quantity_value" numeric(12, 3) NOT NULL,
	"dose_quantity_unit" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"client_mutation_id" uuid NOT NULL,
	CONSTRAINT "chk_schedule_kind" CHECK ("medication_schedule"."schedule_kind" IN ('daily','multiple_times_daily','specific_weekdays','every_n_hours','prn')),
	CONSTRAINT "chk_schedule_time_anchor" CHECK ("medication_schedule"."time_anchor" IS NULL OR "medication_schedule"."time_anchor" IN ('wall_clock','elapsed')),
	CONSTRAINT "chk_end_after_start" CHECK ("medication_schedule"."end_date" IS NULL OR "medication_schedule"."end_date" >= "medication_schedule"."start_date"),
	CONSTRAINT "chk_dose_quantity_positive" CHECK ("medication_schedule"."dose_quantity_value" > 0),
	CONSTRAINT "chk_anchor_matches_kind" CHECK (("medication_schedule"."schedule_kind" = 'prn' AND "medication_schedule"."time_anchor" IS NULL) OR
          ("medication_schedule"."schedule_kind" IN ('daily','multiple_times_daily','specific_weekdays') AND "medication_schedule"."time_anchor" = 'wall_clock') OR
          ("medication_schedule"."schedule_kind" = 'every_n_hours' AND "medication_schedule"."time_anchor" = 'elapsed'))
);
--> statement-breakpoint
CREATE TABLE "medication_schedule_elapsed" (
	"schedule_id" uuid PRIMARY KEY NOT NULL,
	"interval_hours" smallint NOT NULL,
	"anchor_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chk_interval_hours_range" CHECK ("medication_schedule_elapsed"."interval_hours" BETWEEN 1 AND 168)
);
--> statement-breakpoint
CREATE TABLE "medication_schedule_wall_clock" (
	"schedule_id" uuid PRIMARY KEY NOT NULL,
	"times_of_day" time[] NOT NULL,
	"weekdays_mask" smallint,
	CONSTRAINT "chk_times_nonempty" CHECK (cardinality("medication_schedule_wall_clock"."times_of_day") >= 1)
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "profile_owner_account_id_unique" UNIQUE("owner_account_id")
);
--> statement-breakpoint
CREATE TABLE "purchase_list" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"client_mutation_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_list_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purchase_list_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"user_medication_id" uuid,
	"label" text,
	"quantity_value" numeric(12, 3),
	"quantity_unit" text,
	"estimated_unit_price_cents" integer,
	"actual_paid_price_cents" integer,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"purchased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"client_mutation_id" uuid NOT NULL,
	CONSTRAINT "chk_item_has_label" CHECK ("purchase_list_item"."user_medication_id" IS NOT NULL OR "purchase_list_item"."label" IS NOT NULL),
	CONSTRAINT "chk_item_status" CHECK ("purchase_list_item"."status" IN ('pending','purchased','removed')),
	CONSTRAINT "chk_item_estimated_price_nonneg" CHECK ("purchase_list_item"."estimated_unit_price_cents" IS NULL OR "purchase_list_item"."estimated_unit_price_cents" >= 0),
	CONSTRAINT "chk_item_actual_price_nonneg" CHECK ("purchase_list_item"."actual_paid_price_cents" IS NULL OR "purchase_list_item"."actual_paid_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recently_used_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"user_medication_id" uuid NOT NULL,
	"interaction_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_recent_interaction_type" CHECK ("recently_used_event"."interaction_type" IN ('viewed','marked_taken','edited','scanned'))
);
--> statement-breakpoint
CREATE TABLE "sync_change_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"server_version" integer,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_sync_change_log_operation" CHECK ("sync_change_log"."operation" IN ('create','update','delete'))
);
--> statement-breakpoint
CREATE TABLE "sync_mutation" (
	"client_mutation_id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" text NOT NULL,
	"response_snapshot" jsonb,
	CONSTRAINT "chk_sync_mutation_result" CHECK ("sync_mutation"."result" IN ('applied','conflict','rejected'))
);
--> statement-breakpoint
CREATE TABLE "user_medication" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"catalog_product_id" uuid,
	"custom_name" text,
	"custom_form" text,
	"custom_strength_value" numeric(12, 3),
	"custom_strength_unit" text,
	"treatment_state" text DEFAULT 'active' NOT NULL,
	"inventory_unit" text NOT NULL,
	"low_stock_threshold_value" numeric(12, 3),
	"expiry_warning_days" smallint DEFAULT 30 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"client_mutation_id" uuid NOT NULL,
	CONSTRAINT "chk_catalog_or_manual" CHECK ("user_medication"."catalog_product_id" IS NOT NULL OR "user_medication"."custom_name" IS NOT NULL),
	CONSTRAINT "chk_user_medication_treatment_state" CHECK ("user_medication"."treatment_state" IN ('active','completed','paused','discontinued'))
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"language" text DEFAULT 'el' NOT NULL,
	"reminder_default_snooze_minutes" smallint DEFAULT 10 NOT NULL,
	"accessibility_text_scale" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_updated_at" timestamp with time zone,
	CONSTRAINT "chk_preferences_theme" CHECK ("user_preferences"."theme" IN ('system','light','dark')),
	CONSTRAINT "chk_preferences_snooze_positive" CHECK ("user_preferences"."reminder_default_snooze_minutes" > 0),
	CONSTRAINT "chk_preferences_text_scale_range" CHECK ("user_preferences"."accessibility_text_scale" BETWEEN 1.00 AND 3.00)
);
--> statement-breakpoint
ALTER TABLE "account_credential" ADD CONSTRAINT "account_credential_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_session" ADD CONSTRAINT "account_session_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_verification" ADD CONSTRAINT "account_verification_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_event" ADD CONSTRAINT "dose_event_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_event" ADD CONSTRAINT "dose_event_user_medication_id_user_medication_id_fk" FOREIGN KEY ("user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_event" ADD CONSTRAINT "dose_event_schedule_id_medication_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."medication_schedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_user_medication_id_user_medication_id_fk" FOREIGN KEY ("user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_inventory_transaction" ADD CONSTRAINT "medication_inventory_transaction_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_inventory_transaction" ADD CONSTRAINT "medication_inventory_transaction_user_medication_id_user_medication_id_fk" FOREIGN KEY ("user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_inventory_transaction" ADD CONSTRAINT "medication_inventory_transaction_package_id_medication_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."medication_package"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_inventory_transaction" ADD CONSTRAINT "medication_inventory_transaction_dose_event_id_dose_event_id_fk" FOREIGN KEY ("dose_event_id") REFERENCES "public"."dose_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_package" ADD CONSTRAINT "medication_package_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_package" ADD CONSTRAINT "medication_package_user_medication_id_user_medication_id_fk" FOREIGN KEY ("user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_schedule" ADD CONSTRAINT "medication_schedule_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_schedule" ADD CONSTRAINT "medication_schedule_user_medication_id_user_medication_id_fk" FOREIGN KEY ("user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_schedule_elapsed" ADD CONSTRAINT "medication_schedule_elapsed_schedule_id_medication_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."medication_schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_schedule_wall_clock" ADD CONSTRAINT "medication_schedule_wall_clock_schedule_id_medication_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."medication_schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_list" ADD CONSTRAINT "purchase_list_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_list_item" ADD CONSTRAINT "purchase_list_item_purchase_list_id_purchase_list_id_fk" FOREIGN KEY ("purchase_list_id") REFERENCES "public"."purchase_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_list_item" ADD CONSTRAINT "purchase_list_item_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_list_item" ADD CONSTRAINT "purchase_list_item_user_medication_id_user_medication_id_fk" FOREIGN KEY ("user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recently_used_event" ADD CONSTRAINT "recently_used_event_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recently_used_event" ADD CONSTRAINT "recently_used_event_user_medication_id_user_medication_id_fk" FOREIGN KEY ("user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_change_log" ADD CONSTRAINT "sync_change_log_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mutation" ADD CONSTRAINT "sync_mutation_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_medication" ADD CONSTRAINT "user_medication_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_medication" ADD CONSTRAINT "user_medication_catalog_product_id_medication_catalog_product_id_fk" FOREIGN KEY ("catalog_product_id") REFERENCES "public"."medication_catalog_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_account_email" ON "account" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_account_credential_type" ON "account_credential" USING btree ("account_id","credential_type");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_account_session_token_hash" ON "account_session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ix_account_session_account_active" ON "account_session" USING btree ("account_id") WHERE "account_session"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_account_verification_token_hash" ON "account_verification" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_dose_event_schedule_instance" ON "dose_event" USING btree ("user_medication_id","schedule_id","scheduled_at") WHERE "dose_event"."schedule_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_dose_event_profile_today" ON "dose_event" USING btree ("profile_id","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_favorite_profile_medication" ON "favorite" USING btree ("profile_id","user_medication_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_catalog_gtin" ON "medication_catalog_product" USING btree ("gtin") WHERE "medication_catalog_product"."gtin" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_catalog_name_trgm" ON "medication_catalog_product" USING gin ("name_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inventory_txn_dose_taken_once" ON "medication_inventory_transaction" USING btree ("dose_event_id") WHERE "medication_inventory_transaction"."transaction_type" = 'dose_taken';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inventory_txn_client_mutation" ON "medication_inventory_transaction" USING btree ("client_mutation_id");--> statement-breakpoint
CREATE INDEX "ix_inventory_txn_medication" ON "medication_inventory_transaction" USING btree ("user_medication_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ix_package_expiry" ON "medication_package" USING btree ("expiry_date") WHERE "medication_package"."status" NOT IN ('discarded') AND "medication_package"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ix_recent_profile_time" ON "recently_used_event" USING btree ("profile_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_sync_change_log_pull" ON "sync_change_log" USING btree ("profile_id","id");--> statement-breakpoint
CREATE INDEX "ix_user_medication_profile" ON "user_medication" USING btree ("profile_id") WHERE "user_medication"."deleted_at" IS NULL;