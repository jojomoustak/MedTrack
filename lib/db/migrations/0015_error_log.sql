-- Self-hosted internal error log (Phase 15 Hardening observability
-- follow-up, 2026-09-15) — see lib/db/schema.ts's `errorLog` doc comment
-- for the full reasoning (self-hosted per ADR-003's own precedent, rather
-- than a third-party vendor requiring a separate account decision).
--
-- No RLS: not profile/account-owned, an internal ops table with no owner
-- column — same category as `account_deletion_audit` (migration 0001's
-- SCOPE NOTE), reachable only through `lib/errors/http.ts`'s own
-- server-constructed insert, never a client-supplied WHERE clause.
--
-- Forward/rollback: purely additive (a new table), so rollback is a plain
-- DROP TABLE with no data-loss concern for anything outside this app's own
-- error-tracking history.
CREATE TABLE "error_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "code" text NOT NULL,
  "http_status" integer NOT NULL,
  "message" text NOT NULL,
  "context" jsonb
);--> statement-breakpoint
CREATE INDEX "ix_error_log_occurred_at" ON "error_log" USING btree ("occurred_at" DESC);
