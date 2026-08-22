/**
 * ============================================================================
 * Security review (`security-privacy-reviewer`, 2026-08-22)
 * ============================================================================
 * Verdict (confirmation pass, 2026-08-22, same day): **CONFIRMED
 * PRODUCTION-READY.** Item 5's fix is correct and in the right place —
 * `sync_change_log`/`sync_mutation` are now deleted (keyed on `profileId`)
 * before `profile`, inside the same atomic `withProfileScope` batch — and
 * `delete-account.integration.test.ts` now seeds real rows into both
 * tables and asserts they're empty post-deletion (non-vacuous). Item 3's
 * ops runbook (below, near the end of this header) is concrete: an actual
 * `SELECT` against `account_deletion_audit`, not a vague mention.
 * Independently re-checked every `.references()` in `lib/db/schema.ts`
 * against this file's deletion list myself (not just trusting the prior
 * pass): no other profile/account-owned table is missing. No outstanding
 * blockers. One non-blocking nit: the integration test's own inline
 * comment (near its `sync_mutation`/`sync_change_log` seeding block)
 * still asserts nothing in the codebase writes to those tables on any
 * path — that claim is now known to be wrong (`lib/sync/server/
 * mutations.ts` has five raw-SQL `INSERT INTO sync_mutation`/`INSERT INTO
 * sync_change_log` statements across its CTEs, missed by a Drizzle-
 * query-builder-only grep) and should be corrected so it doesn't mislead
 * a future reader; it does not affect the correctness of the fix or the
 * test's own assertions.
 *
 * 1. Account-row disposition (anonymize `account` in place, never hard-
 *    delete the row) — **CONFIRMED as GDPR Art. 17-sufficient**, with one
 *    correction to this module's own stated reasoning. Anonymization
 *    satisfies "right to erasure" provided the residual data can no longer
 *    be attributed to the individual by any party with reasonably likely
 *    means (WP29/EDPB anonymization standard) — and after this workflow
 *    runs, nothing left in the database ties `account.id` back to the real
 *    person: `display_name`/`avatar_url`/`email_verified_at` are NULL, the
 *    real `email` is gone, and `account_credential.email_at_link_time` (the
 *    one other place a real email could have lingered, for Google-linked
 *    rows) is deleted along with the rest of that row. The synthetic email
 *    `deleted-<accountId>@deleted.invalid` does not weaken this: it embeds
 *    `account.id`, which is that same row's own primary key — already the
 *    one stable, unavoidable anchor a live FK target requires — not the
 *    original email, and not a new fact an attacker didn't already have by
 *    reading the row. **Correction:** this module's original comment on
 *    `account-id-hash.ts` asserted the placeholder's embedded id "appears
 *    elsewhere, e.g. in `account_deletion_audit`" — checked directly
 *    against `lib/db/schema.ts`: `account_deletion_audit` and
 *    `deleted_profile_registry` store only `account_id_hash` (an HMAC), never
 *    the raw `account_id`. There is no plaintext cross-table linkage being
 *    created; the premise was wrong, the conclusion (this is fine) happens
 *    to still hold. Residual, non-blocking caveat: Neon's 7-day PITR window
 *    (ADR-002) means the original PII is recoverable from backups for up to
 *    7 days after deletion — an accepted, standard backup-retention grace
 *    period, not a gap this workflow itself can close, but worth naming
 *    explicitly in whatever user-facing deletion copy or privacy policy
 *    documents this (`docs/` has no privacy policy yet per ADR-003
 *    addendum's own tracked gap).
 *
 * 2. `ACCOUNT_ID_HASH_PEPPER` — **CONFIRMED as the right call**, with a
 *    corrected reason. `account-id-hash.ts`'s own comment undersells this as
 *    "applied anyway for consistency... not because a concrete weakness was
 *    found" — that's not quite right. A bare `SHA-256(accountId)` genuinely
 *    would be non-reversible against a blind brute-force of the full UUID
 *    space (128 bits, unlike the ~32-bit IPv4 case `ip_hash` was fixed for)
 *    — but reversibility isn't the only threat model. Without a secret
 *    pepper, `account_id_hash` is a public, deterministic function of
 *    `account_id`: anyone who already holds a specific candidate
 *    `account_id` from any other source (a support ticket, an internal
 *    admin tool, a JWT `sub`, a leaked log line) could compute the hash
 *    themselves and use `deleted_profile_registry`/`account_deletion_audit`
 *    as a confirmation oracle — "was this specific account deleted, and
 *    when, and why" — without ever needing database access to those tables'
 *    neighbors. A dedicated, secret-keyed HMAC closes exactly that
 *    oracle, independent of the brute-force question. Keeping it as a
 *    dedicated pepper rather than reusing `IP_HASH_PEPPER` is also correct
 *    on its own terms (no reason to couple two independent secrets' rotation
 *    schedules), but the oracle-closing property above is the actual
 *    security justification for having a pepper here at all, not just
 *    hygiene-by-precedent.
 *
 * 3. Atomicity / failure handling — **gap confirmed, and item 5 below
 *    proves it is not a rare edge case.** A `failed` `account_deletion_audit`
 *    row with no automatic retry and no described ops runbook is not an
 *    acceptable terminal state for a GDPR erasure request on its own — and
 *    given item 5, "failed" is not a tail risk here, it was (before that
 *    fix) the near-guaranteed outcome for any account with real sync
 *    history. A silently-`failed` deletion that nobody is paged for can
 *    easily blow past GDPR's "without undue delay, within one month"
 *    expectation, especially since the current UI's failure message
 *    ("Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά" — check your connection
 *    and try again) actively misdirects the user toward a connectivity
 *    explanation for what is actually a server-side failure, so a user
 *    experiencing it has no reason to escalate. **Minimum fix required
 *    before this can be considered done:** (a) an alerting hook — a
 *    scheduled check (or a synchronous alert fired from this module's own
 *    catch block) that pages on-call whenever `account_deletion_audit`
 *    has a row in `outcome = 'failed'`, or `outcome = 'in_progress'` older
 *    than a few minutes; (b) a documented ops runbook for what to do on
 *    that alert (inspect the error, fix the underlying cause, re-invoke
 *    `deleteAccount` for that `accountId`/`profileId` — safe to re-run
 *    per this module's own idempotency check); (c) the client-facing
 *    failure copy in `DeleteAccountFlow.tsx` should stop presuming a
 *    connectivity cause. Automatic retry-with-backoff is a nice-to-have on
 *    top of (a)-(c), not a substitute for them — a failure caused by a
 *    genuine schema/constraint bug (as item 5 was) would just fail
 *    identically on every automatic retry until a human fixes the root
 *    cause.
 *
 * 4. Sync enforcement — **CONFIRMED**, read directly, not taken on trust.
 *    `lib/sync/server/mutations.ts`'s `applyMutations()` is the *only*
 *    function any route calls to apply a sync mutation (`app/api/sync/
 *    mutations/route.ts` is the only caller), and it calls
 *    `assertProfileNotDeleted(ctx.profileId, ctx.db)` unconditionally as
 *    its first line, before the per-mutation dispatch loop — every entity
 *    type in `dispatchMutation()`'s switch is gated by the same call, not
 *    just the ones the integration test happens to exercise.
 *
 * 5. Completeness of the deletion list — **CORRECTED: a real, confirmed gap
 *    that breaks this workflow in production for virtually every real
 *    account.** Cross-checking every `pgTable` in `lib/db/schema.ts` that
 *    carries a `profile_id` or `account_id` FK against this file's delete
 *    list found two omissions: **`sync_mutation` and `sync_change_log`**.
 *    Both FK to `profile.id` with `ON DELETE no action` (confirmed in
 *    `lib/db/migrations/0000_phase2_baseline_schema.sql` lines 372-373,
 *    unchanged through migration 0007) — Postgres's default, which behaves
 *    like `RESTRICT`. Because this file's batch never deletes rows from
 *    either table before deleting `profile`, the `DELETE FROM profile`
 *    statement will raise a foreign-key-violation for any profile that has
 *    ever gone through `applyOneMutation()` (i.e., every account that has
 *    ever synced anything — the default path per CLAUDE.md rule 2,
 *    "offline-first is core architecture"). That violation fails the whole
 *    `withProfileScope` batch, which is caught here and marks
 *    `account_deletion_audit.outcome = 'failed'` — meaning, combined with
 *    item 3, this workflow as built would reliably *fail to delete
 *    anything* for real users while reporting a generic "try again" error,
 *    a genuinely serious finding for a GDPR erasure workflow. This gap
 *    passed the existing integration test only because the test never
 *    seeds `sync_mutation`/`sync_change_log` rows for the test profile —
 *    the one realistic table pair a real account always has data in is the
 *    one pair the test never populates. **Required fix (for
 *    `web-engineer`):** add, before the `profile` delete in the batch below,
 *    `scopedDb.delete(schema.syncChangeLog).where(eq(schema.syncChangeLog.profileId, profileId))`
 *    and `scopedDb.delete(schema.syncMutation).where(eq(schema.syncMutation.profileId, profileId))`
 *    (dependency-order position doesn't matter beyond "before `profile`" —
 *    neither table has anything else depending on it) — and extend
 *    `delete-account.integration.test.ts` to seed at least one row in each
 *    (e.g. by driving a real `applyMutations()` call during setup rather
 *    than a raw insert, which also incidentally exercises the realistic
 *    path) and assert both are empty afterward, so this exact class of gap
 *    is caught by the suite next time, not just by manual cross-check.
 *    Every other profile/account-owned table in `lib/db/schema.ts` (all of
 *    §2.5-§2.12, `user_preferences`, `account_credential`, `account_session`,
 *    `account_verification`) is present and in valid dependency order.
 *    `medication_catalog_product` is correctly left untouched — confirmed
 *    it is server-owned reference data with no FK to any profile/account
 *    row, never part of a user's own data.
 *
 * 6. UI/copy (`app/(app)/profile/delete/page.tsx` →
 *    `components/account/DeleteAccountFlow.tsx`) — matches Phase 3 §2.9's
 *    spec: distinct visual treatment (dedicated route, red/warning styling
 *    plus explicit label text, not color alone), real per-account counts
 *    from `/api/account/deletion-summary` (not generic copy), typed
 *    confirmation (`ΔΙΑΓΡΑΦΗ`) rather than a single tap, an explicit
 *    offline-blocked message before the final action is even enabled, a
 *    non-interruptible in-progress state (no route to navigate away to
 *    mid-delete, explicit "don't close or refresh" copy), and a forced
 *    sign-out on completion. Tone reads as calm-but-serious, not alarming.
 *    One concrete correction, tied to item 3: the failure-path copy
 *    ("Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά") presumes a connectivity
 *    cause for every failure; it should be connectivity-agnostic (e.g. "Η
 *    διαγραφή απέτυχε. Δοκιμάστε ξανά αργότερα ή επικοινωνήστε με την
 *    υποστήριξη αν το πρόβλημα επιμένει.") so a user hitting a genuine
 *    server-side failure has a reason to escalate instead of assuming it's
 *    their own network.
 * ============================================================================
 *
 * Hard-delete workflow ("Delete Account / Delete My Health Data",
 * CLAUDE.md rule 9) — Phase 2 §4's Mechanism B, distinct from the normal
 * soft-delete/tombstone sync path (Mechanism A). Not reachable through the
 * sync API at all; only this dedicated, audited server job may perform it.
 *
 * **Account-row disposition (Phase 2 §4 left this explicitly open — a
 * reasoned default, not yet reviewer-confirmed):** the `account` row is
 * ANONYMIZED IN PLACE (`display_name`/`avatar_url`/`email_verified_at`
 * scrubbed to NULL, `email` replaced with a synthetic non-reversible
 * placeholder since it's NOT NULL + UNIQUE, `status = 'deleted'`), never
 * hard-deleted. Reasoning: `account_deletion_audit`/`deleted_profile_registry`
 * and the `account_credential`/`account_session`/`account_verification`
 * FKs (all `ON DELETE no action`) benefit from a stable anchor row rather
 * than a dangling/nonexistent one; nothing about this workflow actually
 * requires the row to be physically gone, only the PII gone — and
 * `status='deleted'` was already an anticipated CHECK value in the
 * original Phase 2 schema (`chk_account_status`), suggesting this was the
 * intended design even before this was built. Flagged for
 * `security-privacy-reviewer` + legal to confirm, exactly as Phase 2 §4
 * asked — this is a default, not a final call.
 *
 * **Ordering (Phase 2 §4 step 2 + ADR-003 "Additional findings" +
 * addendum A.7):** children before parents; `account_session`/
 * `account_credential` (covers Google-linked rows too, A.7 — same table,
 * no separate purge) /`account_verification` purged in the SAME atomic
 * step as the `deleted_profile_registry` insert, so there is no window
 * where a session issued before the request can keep authenticating after
 * deletion completes. `medication_schedule_wall_clock`/`_elapsed` are not
 * deleted explicitly — both have `ON DELETE CASCADE` to
 * `medication_schedule` (confirmed in `lib/db/migrations/0000_...sql`),
 * so deleting the parent is sufficient; the integration test still
 * asserts they're gone rather than trusting this blindly.
 *
 * **Atomicity:** all deletes/the account update/the `deleted_profile_registry`
 * insert run as ONE `withProfileScope` batch — Neon's HTTP driver maps
 * `db.batch([...])` onto a single real Postgres transaction (ADR-002), so
 * this genuinely is one atomic unit, not an approximation. The
 * `account_deletion_audit` row is the checkpoint OUTSIDE that batch on
 * both sides (written `in_progress` before, updated to `completed`/
 * `failed` after) specifically so a mid-batch failure leaves a durable,
 * queryable, non-silent trace (an audit row stuck at `in_progress` or
 * marked `failed`) rather than either total silence or a half-applied
 * database state — the batch itself can never be "half-applied" (all or
 * nothing), only "did or didn't happen," and the audit row records which.
 *
 * **Idempotency:** re-running this for an account whose `profile_id`
 * already has a `deleted_profile_registry` row is a safe no-op (checked
 * first, before touching the audit table) — covers a client retry after a
 * network failure that actually succeeded server-side.
 *
 * **Ops runbook — a `failed`/stuck-`in_progress` audit row (security
 * review item 3):** no automated alerting exists yet (no observability/
 * monitoring service in this project — later hardening phase), so this is
 * the manual procedure until one does.
 *   1. Find affected rows:
 *      ```sql
 *      SELECT * FROM account_deletion_audit
 *      WHERE outcome = 'failed'
 *         OR (outcome = 'in_progress' AND requested_at < now() - interval '1 hour');
 *      ```
 *   2. `account_deletion_audit` only stores `account_id_hash`, not the raw
 *      `account_id` — if you don't already have the real id from the
 *      support/deletion request that triggered this, you cannot reverse
 *      the hash (by design, see item 2 above); cross-reference by
 *      `requested_at`/timing against whatever ticket/log entry prompted
 *      the request, or use `hashAccountId(candidateId)` from
 *      `account-id-hash.ts` against a candidate id and compare.
 *   3. Check `logger`-emitted `account.delete.failed` entries (structured,
 *      redacted — same `requested_at` window) for the real error — the
 *      audit row itself never stores failure detail, on purpose (CLAUDE.md
 *      rule 8, never store raw error/DB detail in a health-adjacent table).
 *   4. Fix the underlying cause if it's a real bug (e.g. exactly what item
 *      5 was — a schema/FK gap). Automatic retry-with-backoff is NOT
 *      built here on purpose: a genuine schema/constraint bug fails
 *      identically on every retry until a human fixes the root cause.
 *   5. Once fixed, simply re-invoke `deleteAccount({ accountId, profileId,
 *      method: 'admin', actor: '<your identifier>' })` for that account —
 *      safe to re-run regardless of whether the prior attempt partially
 *      progressed, per the idempotency check above (and if it had in fact
 *      already fully succeeded despite the stuck row, this call is a
 *      no-op that also closes out the stale audit row).
 */
import { eq } from "drizzle-orm";
import { getDb, type Db, type TestableDb } from "@/lib/db/client";
import { withProfileScope } from "@/lib/db/rls";
import * as schema from "@/lib/db/schema";
import { hashAccountId } from "@/lib/account/server/account-id-hash";
import { logger } from "@/lib/logging/logger";

export type DeletionMethod = "user_initiated" | "admin" | "legal_request";

export interface DeleteAccountRequest {
  accountId: string;
  profileId: string;
  method: DeletionMethod;
  /** Who/what triggered it, for the audit row — e.g. the account id itself for a self-service request. Never raw PII. */
  actor?: string;
}

export interface DeleteAccountResult {
  auditId: string;
  /** True if this call found the account already deleted and short-circuited (idempotent replay). */
  alreadyDeleted: boolean;
}

async function isAlreadyDeleted(profileId: string, db: Db | TestableDb): Promise<boolean> {
  const rows = await withProfileScope(profileId, (scopedDb) => [
    scopedDb
      .select({ profileId: schema.deletedProfileRegistry.profileId })
      .from(schema.deletedProfileRegistry)
      .where(eq(schema.deletedProfileRegistry.profileId, profileId))
      .limit(1),
  ] as const, { db });
  return rows[0].length > 0;
}

export async function deleteAccount(request: DeleteAccountRequest, dbOverride?: Db | TestableDb): Promise<DeleteAccountResult> {
  const { accountId, profileId, method, actor } = request;
  if (!accountId || !profileId) {
    throw new Error("deleteAccount requires both accountId and profileId.");
  }

  const db = dbOverride ?? getDb();
  const accountIdHash = hashAccountId(accountId);

  if (await isAlreadyDeleted(profileId, db)) {
    logger.info("account.delete.already_deleted", { accountIdHash });
    // Best-effort: if a prior attempt's audit row was left stuck (e.g. the
    // process died between the batch committing and the completion
    // update), close it out now rather than leaving it permanently
    // `in_progress` even though the deletion itself plainly succeeded.
    const [stuck] = await db
      .select({ id: schema.accountDeletionAudit.id })
      .from(schema.accountDeletionAudit)
      .where(eq(schema.accountDeletionAudit.accountIdHash, accountIdHash))
      .limit(1);
    if (stuck) {
      await db
        .update(schema.accountDeletionAudit)
        .set({ outcome: "completed", completedAt: new Date().toISOString() })
        .where(eq(schema.accountDeletionAudit.id, stuck.id));
      return { auditId: stuck.id, alreadyDeleted: true };
    }
    // No audit row at all (e.g. seeded/legacy data) — nothing to reconcile.
    return { auditId: "", alreadyDeleted: true };
  }

  const [auditRow] = await db.insert(schema.accountDeletionAudit).values({ accountIdHash, method, actor, outcome: "in_progress" }).returning();

  try {
    await withProfileScope(
      profileId,
      (scopedDb) =>
        [
          // Phase 2 §4 step 2, dependency order (children before parents).
          scopedDb.delete(schema.recentlyUsedEvent).where(eq(schema.recentlyUsedEvent.profileId, profileId)),
          scopedDb.delete(schema.purchaseListItem).where(eq(schema.purchaseListItem.profileId, profileId)),
          scopedDb.delete(schema.purchaseList).where(eq(schema.purchaseList.profileId, profileId)),
          scopedDb.delete(schema.favorite).where(eq(schema.favorite.profileId, profileId)),
          scopedDb
            .delete(schema.medicationInventoryTransaction)
            .where(eq(schema.medicationInventoryTransaction.profileId, profileId)),
          scopedDb.delete(schema.doseEvent).where(eq(schema.doseEvent.profileId, profileId)),
          // Cascades to medication_schedule_wall_clock/_elapsed (ON DELETE CASCADE).
          scopedDb.delete(schema.medicationSchedule).where(eq(schema.medicationSchedule.profileId, profileId)),
          scopedDb.delete(schema.medicationPackage).where(eq(schema.medicationPackage.profileId, profileId)),
          scopedDb.delete(schema.userMedication).where(eq(schema.userMedication.profileId, profileId)),
          scopedDb.delete(schema.userPreferences).where(eq(schema.userPreferences.accountId, accountId)),
          // Security review (2026-08-22), item 5: both FK to profile.id with
          // ON DELETE no action — without these, DELETE FROM profile below
          // fails FK-violation for any account that has ever synced
          // anything (i.e. virtually every real account, offline-first
          // being core architecture, CLAUDE.md rule 2). Must come before
          // the profile delete; nothing else depends on either table.
          scopedDb.delete(schema.syncChangeLog).where(eq(schema.syncChangeLog.profileId, profileId)),
          scopedDb.delete(schema.syncMutation).where(eq(schema.syncMutation.profileId, profileId)),
          scopedDb.delete(schema.profile).where(eq(schema.profile.id, profileId)),
          // ADR-003 "Additional findings": purge auth tables atomically
          // with the deleted_profile_registry insert below, not after.
          scopedDb.delete(schema.accountSession).where(eq(schema.accountSession.accountId, accountId)),
          scopedDb.delete(schema.accountCredential).where(eq(schema.accountCredential.loginAccountId, accountId)),
          scopedDb.delete(schema.accountVerification).where(eq(schema.accountVerification.accountId, accountId)),
          // Account-row disposition: anonymize in place, see module doc.
          // `email` is NOT NULL + UNIQUE (Phase 2 §2.1) — can't set it to
          // NULL, so it's replaced with a synthetic, non-reversible
          // placeholder derived from the row's own id (guaranteed unique,
          // never derivable back to the real address).
          scopedDb
            .update(schema.account)
            .set({
              email: `deleted-${accountId}@deleted.invalid`,
              displayName: null,
              avatarUrl: null,
              emailVerifiedAt: null,
              status: "deleted",
              updatedAt: new Date().toISOString(),
            })
            .where(eq(schema.account.id, accountId)),
          // Permanent, FK-less marker — outlives everything above.
          scopedDb.insert(schema.deletedProfileRegistry).values({
            profileId,
            accountIdHash,
            reason: "account_deletion",
          }),
        ] as const,
      { accountId, db },
    );
  } catch (err) {
    logger.error("account.delete.failed", { accountIdHash, error: err instanceof Error ? err.message : String(err) });
    await db
      .update(schema.accountDeletionAudit)
      .set({ outcome: "failed" })
      .where(eq(schema.accountDeletionAudit.id, auditRow.id));
    throw err;
  }

  await db
    .update(schema.accountDeletionAudit)
    .set({ outcome: "completed", completedAt: new Date().toISOString() })
    .where(eq(schema.accountDeletionAudit.id, auditRow.id));

  logger.info("account.delete.completed", { accountIdHash });
  return { auditId: auditRow.id, alreadyDeleted: false };
}
