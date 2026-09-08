-- ADR-014: adds free-text notes to a dose event, for the "Dose history
-- detail" screen (Phase 3 §2.6). Additive, nullable, no backfill.
ALTER TABLE "dose_event" ADD COLUMN "notes" text;
