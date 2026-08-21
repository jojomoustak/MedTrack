-- Row-Level Security (Phase 2 §0) and the schedule-subtype integrity
-- trigger (Phase 2 §2.6, risk R15) — hand-written rather than generated,
-- so this security-critical surface is reviewable as one coherent unit.
--
-- OPERATIONAL NOTE for release-engineer / Neon project provisioning:
-- Postgres table OWNERS bypass RLS by default, and `ALTER TABLE ... FORCE
-- ROW LEVEL SECURITY` below closes that gap by making RLS apply even to
-- the owning role (superusers still always bypass, which is fine — no
-- superuser role is ever used for application traffic). The recommended
-- production hardening beyond what's expressed here is to also run
-- application traffic (DATABASE_URL) as a role that is NOT the
-- table-owning role migrations run as (DATABASE_URL_DIRECT) — FORCE ROW
-- LEVEL SECURITY makes this defense-in-depth rather than load-bearing, but
-- a separate least-privilege role is still good practice and is flagged
-- here for that follow-up, not implemented in this migration (creating
-- and wiring a second Neon role requires the live project).
--
-- SCOPE NOTE: RLS is applied to every profile-owned domain/sync table per
-- Phase 2 §0. It is deliberately NOT applied to:
--   - medication_catalog_product — shared, no owner, no client writes (§2.4).
--   - account, account_credential, account_session, account_verification —
--     these are pre-authentication / authentication-establishing tables
--     (Better Auth looks up a session by token_hash before any
--     account/profile context exists — RLS keyed on that same context
--     would make the initial lookup itself impossible). They're protected
--     instead by being reachable only through Better Auth's own
--     server-constructed queries (lib/auth), never a client-supplied
--     WHERE clause, per ADR-003.
--   - account_deletion_audit — admin/audit-only table with no profile_id
--     or account_id column (only a one-way `account_id_hash`); not meant
--     to be queried through the profile-scoped repository path at all.
--
-- POLICY SHAPE NOTE: Phase 2 §0 documents `USING (profile_id = ...)`
-- (read-side). This migration uses `FOR ALL ... USING (...) WITH CHECK
-- (...)` (read AND write) as a strictly stronger, defense-in-depth
-- superset — an INSERT/UPDATE that tries to write a row under a
-- profile_id/account_id other than the current request's context is
-- rejected by the database itself, not just filtered out of SELECT
-- results.
--
-- SUBTYPE-TABLE NOTE: `medication_schedule_wall_clock` /
-- `medication_schedule_elapsed` (Phase 2 §2.6) do not carry a `profile_id`
-- column in the specified DDL (they key only on `schedule_id`). RLS is
-- still applied to them via a join back to `medication_schedule`, so this
-- doesn't require adding an undocumented column to match the rest of the
-- schema — flagged here for `data-architect` as worth reconciling in a
-- future revision of Phase 2 §0/§2.6 (either accept the join-based policy
-- as the pattern for 1:1 subtype tables, or add profile_id there too).
--> statement-breakpoint

ALTER TABLE "profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profile" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_profile" ON "profile" FOR ALL
  USING ("id" = current_setting('app.current_profile_id', true)::uuid)
  WITH CHECK ("id" = current_setting('app.current_profile_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_preferences" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_user_preferences" ON "user_preferences" FOR ALL
  USING ("account_id" = current_setting('app.current_account_id', true)::uuid)
  WITH CHECK ("account_id" = current_setting('app.current_account_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "user_medication" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_medication" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_user_medication" ON "user_medication" FOR ALL
  USING ("profile_id" = current_setting('app.current_profile_id', true)::uuid)
  WITH CHECK ("profile_id" = current_setting('app.current_profile_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "medication_schedule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "medication_schedule" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_medication_schedule" ON "medication_schedule" FOR ALL
  USING ("profile_id" = current_setting('app.current_profile_id', true)::uuid)
  WITH CHECK ("profile_id" = current_setting('app.current_profile_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "medication_schedule_wall_clock" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "medication_schedule_wall_clock" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_medication_schedule_wall_clock" ON "medication_schedule_wall_clock" FOR ALL
  USING ("schedule_id" IN (SELECT "id" FROM "medication_schedule" WHERE "profile_id" = current_setting('app.current_profile_id', true)::uuid))
  WITH CHECK ("schedule_id" IN (SELECT "id" FROM "medication_schedule" WHERE "profile_id" = current_setting('app.current_profile_id', true)::uuid));--> statement-breakpoint

ALTER TABLE "medication_schedule_elapsed" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "medication_schedule_elapsed" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_medication_schedule_elapsed" ON "medication_schedule_elapsed" FOR ALL
  USING ("schedule_id" IN (SELECT "id" FROM "medication_schedule" WHERE "profile_id" = current_setting('app.current_profile_id', true)::uuid))
  WITH CHECK ("schedule_id" IN (SELECT "id" FROM "medication_schedule" WHERE "profile_id" = current_setting('app.current_profile_id', true)::uuid));--> statement-breakpoint

ALTER TABLE "dose_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dose_event" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_dose_event" ON "dose_event" FOR ALL
  USING ("profile_id" = current_setting('app.current_profile_id', true)::uuid)
  WITH CHECK ("profile_id" = current_setting('app.current_profile_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "medication_package" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "medication_package" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_medication_package" ON "medication_package" FOR ALL
  USING ("profile_id" = current_setting('app.current_profile_id', true)::uuid)
  WITH CHECK ("profile_id" = current_setting('app.current_profile_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "medication_inventory_transaction" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "medication_inventory_transaction" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_medication_inventory_transaction" ON "medication_inventory_transaction" FOR ALL
  USING ("profile_id" = current_setting('app.current_profile_id', true)::uuid)
  WITH CHECK ("profile_id" = current_setting('app.current_profile_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "favorite" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "favorite" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_favorite" ON "favorite" FOR ALL
  USING ("profile_id" = current_setting('app.current_profile_id', true)::uuid)
  WITH CHECK ("profile_id" = current_setting('app.current_profile_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "recently_used_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recently_used_event" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_recently_used_event" ON "recently_used_event" FOR ALL
  USING ("profile_id" = current_setting('app.current_profile_id', true)::uuid)
  WITH CHECK ("profile_id" = current_setting('app.current_profile_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "purchase_list" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_list" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_purchase_list" ON "purchase_list" FOR ALL
  USING ("profile_id" = current_setting('app.current_profile_id', true)::uuid)
  WITH CHECK ("profile_id" = current_setting('app.current_profile_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "purchase_list_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_list_item" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_purchase_list_item" ON "purchase_list_item" FOR ALL
  USING ("profile_id" = current_setting('app.current_profile_id', true)::uuid)
  WITH CHECK ("profile_id" = current_setting('app.current_profile_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "sync_mutation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_mutation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_sync_mutation" ON "sync_mutation" FOR ALL
  USING ("profile_id" = current_setting('app.current_profile_id', true)::uuid)
  WITH CHECK ("profile_id" = current_setting('app.current_profile_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "sync_change_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_change_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_sync_change_log" ON "sync_change_log" FOR ALL
  USING ("profile_id" = current_setting('app.current_profile_id', true)::uuid)
  WITH CHECK ("profile_id" = current_setting('app.current_profile_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "deleted_profile_registry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deleted_profile_registry" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rls_deleted_profile_registry" ON "deleted_profile_registry" FOR ALL
  USING ("profile_id" = current_setting('app.current_profile_id', true)::uuid)
  WITH CHECK ("profile_id" = current_setting('app.current_profile_id', true)::uuid);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Schedule-subtype integrity trigger (Phase 2 §2.6 / risk R15).
--
-- Postgres has no declarative cross-table CHECK, so "exactly the matching
-- subtype row exists for this schedule's time_anchor" is enforced here
-- with a deferred constraint trigger: it fires after INSERT/UPDATE on
-- medication_schedule, but — because it's DEFERRABLE INITIALLY DEFERRED —
-- actually runs at COMMIT time, after the client's parent-row and
-- subtype-row inserts (sent together in one transaction) have both
-- landed. This closes the ordering problem an immediate trigger would hit
-- (parent row exists, subtype row insert hasn't happened yet).
--
-- Known residual gap (documented, not silently left open): this trigger
-- fires on medication_schedule writes, not on direct
-- DELETE from the subtype tables. A write path that deletes a subtype row
-- without touching its parent bypasses this check. No such path exists in
-- the sync API design (subtype rows are only ever removed via
-- ON DELETE CASCADE from their parent), but this is flagged for
-- security-privacy-reviewer/data-architect follow-up rather than assumed
-- closed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_medication_schedule_subtype() RETURNS trigger AS $$
DECLARE
  wall_clock_exists boolean;
  elapsed_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM medication_schedule_wall_clock WHERE schedule_id = NEW.id) INTO wall_clock_exists;
  SELECT EXISTS(SELECT 1 FROM medication_schedule_elapsed WHERE schedule_id = NEW.id) INTO elapsed_exists;

  IF NEW.time_anchor = 'wall_clock' THEN
    IF NOT wall_clock_exists OR elapsed_exists THEN
      RAISE EXCEPTION 'medication_schedule % (wall_clock) must have exactly one matching medication_schedule_wall_clock row and no medication_schedule_elapsed row', NEW.id;
    END IF;
  ELSIF NEW.time_anchor = 'elapsed' THEN
    IF NOT elapsed_exists OR wall_clock_exists THEN
      RAISE EXCEPTION 'medication_schedule % (elapsed) must have exactly one matching medication_schedule_elapsed row and no medication_schedule_wall_clock row', NEW.id;
    END IF;
  ELSE
    -- PRN (or any future kind with no fixed-time anchor): no subtype row at all.
    IF wall_clock_exists OR elapsed_exists THEN
      RAISE EXCEPTION 'medication_schedule % (prn) must have no wall-clock or elapsed subtype row', NEW.id;
    END IF;
  END IF;

  RETURN NULL; -- AFTER trigger: return value is ignored
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER trg_medication_schedule_subtype_integrity
  AFTER INSERT OR UPDATE ON medication_schedule
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_medication_schedule_subtype();
