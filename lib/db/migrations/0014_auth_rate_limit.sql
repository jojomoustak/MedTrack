-- Better Auth's own rate-limit persistence (`rateLimit: { storage:
-- "database", ... }`, lib/auth/config.ts), added alongside the
-- password-reset / email-verification / per-IP login rate-limiting work
-- (security audit follow-up, 2026-09-15). Needs a real table Better Auth's
-- Drizzle adapter can write to, per this project's own convention (every
-- Better Auth model gets an explicit hand-named table + field mapping,
-- never Better Auth's generated defaults — see how account/account_session/
-- account_credential/account_verification are all done in
-- lib/db/schema.ts). Forward/rollback: purely additive (a new table), so
-- rollback is a plain DROP TABLE with no data-loss concern for anything
-- outside Better Auth's own rate-limit bookkeeping (rows are ephemeral
-- counters, never user-facing data).
--
-- SCOPE NOTE (extends migration 0001's own SCOPE NOTE, which pre-dates this
-- table): RLS is deliberately NOT applied here. This is an internal
-- auth-infrastructure table, not profile/account-owned data — it has no
-- profile_id/account_id column at all (Better Auth's rate limiter keys
-- rows by an opaque, IP/path-derived `key` string), so there is no owner
-- context to scope a policy on, and it is reachable only through Better
-- Auth's own server-constructed adapter calls, never a client-supplied
-- WHERE clause. Same category as account_credential/account_session/
-- account_verification (pre-authentication tables, migration 0001) and
-- account_deletion_audit (admin/audit-only, no owner column either).
CREATE TABLE "auth_rate_limit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "count" integer NOT NULL,
  "last_request" bigint NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_auth_rate_limit_key" ON "auth_rate_limit" USING btree ("key");
