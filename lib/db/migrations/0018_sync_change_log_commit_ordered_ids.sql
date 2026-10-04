-- Make `sync_change_log.id` commit-ordered within a profile (security
-- review, 2026-10-04).
--
-- The pull feed (`lib/sync/server/changes.ts`) hands a device every row with
-- `id > cursor` and the device then advances its cursor to the highest id it
-- saw. A plain bigserial is assigned when the row is INSERTed, not when its
-- transaction commits, so two concurrent writes for one profile can become
-- visible out of order: T1 takes id 10, T2 takes id 11, T2 commits first, a
-- device pulls 11 and moves its cursor past 10 — and when T1 commits, id 10
-- is below every cursor and that change never reaches the device.
--
-- Fix: before a row gets its id, take a transaction-scoped advisory lock on
-- its profile, then draw the id from the sequence. The lock is held until
-- commit, so a second writer for the same profile can only draw its id after
-- the first has committed — within a profile, ids become visible in id
-- order. Cross-profile order doesn't matter: every pull is per profile.
-- Writers for one profile already serialize in practice (one user, one
-- outbox drain at a time), so the lock costs nothing measurable; different
-- profiles never contend (barring a hash collision, which only serializes).
--
-- Done as a trigger so every insert path is covered, including ones added
-- later. A BEFORE trigger runs after column defaults are evaluated, so the
-- id the default drew (before the lock) is replaced; the discarded value is
-- just a gap, which the feed already tolerates.
--
-- Forward: no data change — existing rows keep their ids.
-- Rollback: DROP TRIGGER trg_sync_change_log_commit_ordered_id ON
-- sync_change_log; DROP FUNCTION sync_change_log_commit_ordered_id();
CREATE OR REPLACE FUNCTION sync_change_log_commit_ordered_id() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('sync_change_log:' || NEW.profile_id::text, 0));
  NEW.id := nextval(pg_get_serial_sequence('sync_change_log', 'id'));
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER trg_sync_change_log_commit_ordered_id
  BEFORE INSERT ON sync_change_log
  FOR EACH ROW EXECUTE FUNCTION sync_change_log_commit_ordered_id();
