/**
 * Integration test against a REAL Postgres instance (same throwaway-only
 * discipline as every other `*.integration.test.ts` in this codebase —
 * see `lib/sync/server/mutations.integration.test.ts`'s header for setup
 * instructions). NEVER run against the real Neon database — this test
 * creates and then destroys a full account's worth of data; it must only
 * ever target a disposable local Postgres container.
 *
 * Seeds a full account across every table in Phase 2 §4's deletion list
 * (plus ADR-003's auth-table additions, a Google-linked credential row
 * per addendum A.7, and `sync_mutation`/`sync_change_log` per the
 * 2026-08-22 security review's item 5 — both FK to `profile.id` with
 * `ON DELETE no action` and were found missing from the deletion job by
 * that review), runs the real `deleteAccount` job, and asserts:
 *   - every listed table is empty for that account/profile afterward;
 *   - `medication_schedule_wall_clock`/`_elapsed` are gone too (via
 *     cascade — asserted directly, not just trusted);
 *   - `account` still exists but is anonymized (`status='deleted'`,
 *     PII scrubbed) — the reasoned default this task made, not a design
 *     ADR-003/Phase 2 itself finalized;
 *   - `deleted_profile_registry` has the row, `account_deletion_audit`
 *     shows `completed`;
 *   - a subsequent sync mutation attempt for that profile is rejected
 *     (`assertProfileNotDeleted`/`applyMutations`, already built in
 *     Phase 5 — confirmed here, not re-implemented);
 *   - the previously-valid session token can no longer authenticate
 *     (`validateSessionToken` returns null).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import type { TestableDb } from "@/lib/db/client";
import { deleteAccount } from "@/lib/account/server/delete-account";
import { hashAccountId } from "@/lib/account/server/account-id-hash";
import { hashSessionToken } from "@/lib/auth/adr003-adapter";
import { validateSessionToken } from "@/lib/auth/session";
import { applyMutations } from "@/lib/sync/server/mutations";
import { ConflictError } from "@/lib/errors/app-error";

const connectionString = process.env.ACCOUNT_DELETE_IT_DATABASE_URL;

describe.skipIf(!connectionString)("deleteAccount — full hard-delete workflow (CLAUDE.md rule 9, Phase 2 §4)", () => {
  let pool: Pool;
  let db: TestableDb;

  beforeAll(() => {
    process.env.DATABASE_DRIVER = "local-pg";
    process.env.DATABASE_URL = connectionString;
    process.env.DATABASE_URL_DIRECT = connectionString;
    process.env.ACCOUNT_ID_HASH_PEPPER ??= "test-only-pepper-not-for-production-use-32chars";
    process.env.BETTER_AUTH_SECRET ??= "test-only-secret-not-for-production-use-32chars";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    process.env.BETTER_AUTH_TRUSTED_ORIGINS ??= "http://localhost:3000";
    process.env.IP_HASH_PEPPER ??= "test-only-pepper-not-for-production-use-32chars";
    process.env.GOOGLE_CLIENT_ID ??= "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";

    pool = new Pool({ connectionString });
    db = drizzle(pool, { schema });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("deletes every listed table, anonymizes account, blocks sync, and invalidates the session — for real, against real Postgres", async () => {
    const accountId = randomUUID();
    const profileId = randomUUID();
    const userMedicationId = randomUUID();
    const wallClockScheduleId = randomUUID();
    const elapsedScheduleId = randomUUID();
    const doseEventId = randomUUID();
    const packageId = randomUUID();
    const purchaseListId = randomUUID();
    const rawSessionToken = `raw-session-token-${randomUUID()}`;

    // Wrapped in one explicit transaction: `medication_schedule`'s subtype
    // integrity check (`trg_medication_schedule_subtype_integrity`) is a
    // `DEFERRABLE INITIALLY DEFERRED` constraint trigger, which only
    // evaluates at COMMIT — running each insert as its own separately
    // auto-committed statement (the default for a bare `pg` Pool with no
    // explicit transaction) makes it commit, and thus check, after JUST
    // the parent row exists, before its subtype row is ever inserted.
    await db.transaction(async (tx) => {
      // --- seed: account + profile + preferences ---------------------------
      await tx.insert(schema.account).values({
        id: accountId,
        email: `to-be-deleted-${accountId}@example.com`,
        displayName: "Real Person Name",
        avatarUrl: "https://lh3.googleusercontent.com/a/real-looking-avatar",
        status: "active",
      });
      await tx.insert(schema.profile).values({ id: profileId, ownerAccountId: accountId, displayName: "Real Person" });
      await tx.insert(schema.userPreferences).values({ accountId });

      // --- seed: a medication with both schedule subtypes -------------------
      await tx.insert(schema.userMedication).values({
        id: userMedicationId,
        profileId,
        customName: "Παρακεταμόλη",
        inventoryUnit: "tablet",
        clientMutationId: randomUUID(),
      });
      await tx.insert(schema.medicationSchedule).values({
        id: wallClockScheduleId,
        profileId,
        userMedicationId,
        scheduleKind: "daily",
        timeAnchor: "wall_clock",
        startDate: "2026-01-01",
        doseQuantityValue: "1",
        doseQuantityUnit: "tablet",
        clientMutationId: randomUUID(),
      });
      await tx.insert(schema.medicationScheduleWallClock).values({ scheduleId: wallClockScheduleId, timesOfDay: ["08:00:00"] });
      await tx.insert(schema.medicationSchedule).values({
        id: elapsedScheduleId,
        profileId,
        userMedicationId,
        scheduleKind: "every_n_hours",
        timeAnchor: "elapsed",
        startDate: "2026-01-01",
        doseQuantityValue: "1",
        doseQuantityUnit: "tablet",
        clientMutationId: randomUUID(),
      });
      await tx.insert(schema.medicationScheduleElapsed).values({ scheduleId: elapsedScheduleId, intervalHours: 8, anchorAt: new Date().toISOString() });

      // --- seed: dose event, package, inventory transaction ------------------
      await tx.insert(schema.doseEvent).values({
        id: doseEventId,
        profileId,
        userMedicationId,
        status: "taken",
        takenAt: new Date().toISOString(),
        source: "manual_prn",
        clientMutationId: randomUUID(),
      });
      await tx.insert(schema.medicationPackage).values({
        id: packageId,
        profileId,
        userMedicationId,
        source: "manual",
        initialQuantityValue: "30",
        quantityUnit: "tablet",
        clientMutationId: randomUUID(),
      });
      await tx.insert(schema.medicationInventoryTransaction).values({
        id: randomUUID(),
        profileId,
        userMedicationId,
        packageId,
        doseEventId,
        transactionType: "dose_taken",
        quantityDelta: "-1",
        quantityUnit: "tablet",
        source: "user",
        clientMutationId: randomUUID(),
      });

      // --- seed: favorite, recent, purchase list + item -----------------------
      await tx.insert(schema.favorite).values({ id: randomUUID(), profileId, userMedicationId, clientMutationId: randomUUID() });
      await tx.insert(schema.recentlyUsedEvent).values({
        id: randomUUID(),
        profileId,
        userMedicationId,
        interactionType: "marked_taken",
        occurredAt: new Date().toISOString(),
      });
      await tx.insert(schema.purchaseList).values({ id: purchaseListId, profileId, name: "Φαρμακείο", clientMutationId: randomUUID() });
      await tx.insert(schema.purchaseListItem).values({
        id: randomUUID(),
        purchaseListId,
        profileId,
        userMedicationId,
        clientMutationId: randomUUID(),
      });

      // --- seed: auth tables — password credential, Google-linked credential,
      // an active session, and a verification row --------------------------
      await tx.insert(schema.accountCredential).values({
        id: randomUUID(),
        loginAccountId: accountId,
        credentialType: "password",
        passwordHash: "$argon2id$fake-hash-for-test",
      });
      await tx.insert(schema.accountCredential).values({
        id: randomUUID(),
        loginAccountId: accountId,
        credentialType: "google",
        providerAccountId: `google-sub-${accountId}`,
        linkedAt: new Date().toISOString(),
        emailAtLinkTime: `to-be-deleted-${accountId}@example.com`,
      });
      await tx.insert(schema.accountSession).values({
        id: randomUUID(),
        accountId,
        tokenHash: hashSessionToken(rawSessionToken),
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      await tx.insert(schema.accountVerification).values({
        id: randomUUID(),
        accountId,
        purpose: "password_reset",
        tokenHash: "fake-verification-token-hash",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
    });

    // --- seed: sync_mutation + sync_change_log ------------------------------
    // Security review (2026-08-22), item 5, recommended driving this via a
    // REAL `applyMutations()` call rather than a raw insert, so the test
    // reflects what a real account genuinely accumulates.
    //
    // Correction (2026-08-22, coordinating session): an earlier version of
    // this comment claimed `applyMutations()` never writes to either table
    // and flagged that as a separate multi-device-sync gap. That was wrong
    // — a grep for the Drizzle query-builder form
    // (`.insert(schema.syncMutation)`/`.insert(schema.syncChangeLog)`)
    // missed the real writes: `lib/sync/server/mutations.ts` embeds
    // `INSERT INTO sync_mutation`/`INSERT INTO sync_change_log` as raw SQL
    // inside each entity's atomic CTE (5 occurrences across the
    // user-preferences and purchase-list handlers). The sync write-path is
    // implemented and working; there is no separate gap.
    //
    // Seeding directly here regardless (not via `applyMutations()`), for a
    // simpler reason than the one originally given: this test only needs
    // *some* realistic rows in these two tables to prove the deletion job
    // purges them — it doesn't need to exercise one specific entity's real
    // mutation-application logic to do that, and a direct seed keeps this
    // test focused on deletion rather than coupling it to the sync API's
    // request/response shape.
    await db.insert(schema.syncMutation).values({
      clientMutationId: randomUUID(),
      profileId,
      entityType: "userMedication",
      entityId: userMedicationId,
      result: "applied",
    });
    await db.insert(schema.syncChangeLog).values({
      profileId,
      entityType: "userMedication",
      entityId: userMedicationId,
      operation: "create",
      serverVersion: 1,
    });

    // Sanity: the session genuinely authenticates BEFORE deletion.
    const preDeleteSession = await validateSessionToken(rawSessionToken);
    expect(preDeleteSession?.accountId).toBe(accountId);

    // --- run the real deletion job ------------------------------------------
    const result = await deleteAccount({ accountId, profileId, method: "user_initiated", actor: "test" }, db);
    expect(result.alreadyDeleted).toBe(false);
    expect(result.auditId).toBeTruthy();

    // --- assert: every listed table is empty for this profile/account ------
    const emptyChecks: Array<[string, unknown[]]> = [
      ["recently_used_event", await db.select().from(schema.recentlyUsedEvent).where(eq(schema.recentlyUsedEvent.profileId, profileId))],
      ["purchase_list_item", await db.select().from(schema.purchaseListItem).where(eq(schema.purchaseListItem.profileId, profileId))],
      ["purchase_list", await db.select().from(schema.purchaseList).where(eq(schema.purchaseList.profileId, profileId))],
      ["favorite", await db.select().from(schema.favorite).where(eq(schema.favorite.profileId, profileId))],
      [
        "medication_inventory_transaction",
        await db.select().from(schema.medicationInventoryTransaction).where(eq(schema.medicationInventoryTransaction.profileId, profileId)),
      ],
      ["dose_event", await db.select().from(schema.doseEvent).where(eq(schema.doseEvent.profileId, profileId))],
      ["medication_schedule", await db.select().from(schema.medicationSchedule).where(eq(schema.medicationSchedule.profileId, profileId))],
      [
        "medication_schedule_wall_clock",
        await db.select().from(schema.medicationScheduleWallClock).where(eq(schema.medicationScheduleWallClock.scheduleId, wallClockScheduleId)),
      ],
      [
        "medication_schedule_elapsed",
        await db.select().from(schema.medicationScheduleElapsed).where(eq(schema.medicationScheduleElapsed.scheduleId, elapsedScheduleId)),
      ],
      ["medication_package", await db.select().from(schema.medicationPackage).where(eq(schema.medicationPackage.profileId, profileId))],
      ["user_medication", await db.select().from(schema.userMedication).where(eq(schema.userMedication.profileId, profileId))],
      ["user_preferences", await db.select().from(schema.userPreferences).where(eq(schema.userPreferences.accountId, accountId))],
      // Security review (2026-08-22), item 5 — the actual gap this test
      // extension exists to catch: both FK to profile.id with ON DELETE
      // no action, and were previously missing from the deletion job.
      ["sync_mutation", await db.select().from(schema.syncMutation).where(eq(schema.syncMutation.profileId, profileId))],
      ["sync_change_log", await db.select().from(schema.syncChangeLog).where(eq(schema.syncChangeLog.profileId, profileId))],
      ["profile", await db.select().from(schema.profile).where(eq(schema.profile.id, profileId))],
      ["account_session", await db.select().from(schema.accountSession).where(eq(schema.accountSession.accountId, accountId))],
      ["account_credential", await db.select().from(schema.accountCredential).where(eq(schema.accountCredential.loginAccountId, accountId))],
      ["account_verification", await db.select().from(schema.accountVerification).where(eq(schema.accountVerification.accountId, accountId))],
    ];
    for (const [table, rows] of emptyChecks) {
      expect(rows, `expected ${table} to be empty for this profile/account`).toHaveLength(0);
    }

    // --- assert: account row anonymized, not deleted ------------------------
    const [accountRow] = await db.select().from(schema.account).where(eq(schema.account.id, accountId));
    expect(accountRow).toBeTruthy();
    expect(accountRow.status).toBe("deleted");
    expect(accountRow.displayName).toBeNull();
    expect(accountRow.avatarUrl).toBeNull();
    expect(accountRow.emailVerifiedAt).toBeNull();
    expect(accountRow.email).not.toContain("to-be-deleted");
    expect(accountRow.email).toContain("deleted-");

    // --- assert: deleted_profile_registry + account_deletion_audit ----------
    const [registryRow] = await db.select().from(schema.deletedProfileRegistry).where(eq(schema.deletedProfileRegistry.profileId, profileId));
    expect(registryRow).toBeTruthy();
    expect(registryRow.accountIdHash).toBe(hashAccountId(accountId));
    expect(registryRow.reason).toBe("account_deletion");

    const [auditRow] = await db.select().from(schema.accountDeletionAudit).where(eq(schema.accountDeletionAudit.id, result.auditId));
    expect(auditRow.outcome).toBe("completed");
    expect(auditRow.completedAt).not.toBeNull();

    // --- assert: sync is rejected for this now-deleted profile --------------
    await expect(
      applyMutations({ profileId, accountId, db }, [
        { clientMutationId: randomUUID(), entityType: "purchaseList", entityId: randomUUID(), operation: "create", payload: { name: "Should be rejected" } },
      ]),
    ).rejects.toBeInstanceOf(ConflictError);

    // --- assert: the previously-valid session can no longer authenticate ----
    const postDeleteSession = await validateSessionToken(rawSessionToken);
    expect(postDeleteSession).toBeNull();
  }, 30_000);

  it("is idempotent — calling deleteAccount again for an already-deleted profile is a safe no-op, not an error", async () => {
    const accountId = randomUUID();
    const profileId = randomUUID();

    await db.insert(schema.account).values({ id: accountId, email: `idempotent-${accountId}@example.com`, status: "active" });
    await db.insert(schema.profile).values({ id: profileId, ownerAccountId: accountId });

    const first = await deleteAccount({ accountId, profileId, method: "user_initiated" }, db);
    expect(first.alreadyDeleted).toBe(false);

    const second = await deleteAccount({ accountId, profileId, method: "user_initiated" }, db);
    expect(second.alreadyDeleted).toBe(true);

    // Still exactly one deleted_profile_registry row — no duplicate/error.
    const rows = await db.select().from(schema.deletedProfileRegistry).where(eq(schema.deletedProfileRegistry.profileId, profileId));
    expect(rows).toHaveLength(1);
  }, 30_000);
});
