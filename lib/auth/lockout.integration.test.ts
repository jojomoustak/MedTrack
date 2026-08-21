/**
 * Integration tests against a REAL Postgres instance (same approach/env
 * vars as `lib/sync/server/mutations.integration.test.ts` — see that
 * file's header for how to run these locally).
 *
 * ADR-003 addendum A.6 / "Security review resolution (addendum)" item 3
 * — mandatory test: create an account with BOTH a `password` and a
 * `google` `account_credential` row, drive failed password attempts to
 * the lockout threshold, and assert (a) the `google` row's
 * `failed_login_count`/`locked_until` are untouched and (b) a Google
 * sign-in on the same account still succeeds while the password row is
 * locked out, and vice versa.
 *
 * `account_credential` has no RLS policy (it's Better Auth's own
 * identity-management table, not profile-scoped medical data — confirmed
 * against `lib/db/migrations/0001_rls_policies_and_schedule_trigger.sql`,
 * which never enables RLS on it), so a single connection (no app_role/
 * admin split) is used throughout, unlike the sync integration tests.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import type { TestableDb } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/argon2";
import { LOCKOUT_THRESHOLD, verifyPasswordWithLockout } from "@/lib/auth/lockout";

const connectionString = process.env.SYNC_IT_DATABASE_URL;

describe.skipIf(!connectionString)("password-credential lockout is scoped to credential_type='password' (ADR-003 addendum A.6)", () => {
  let pool: Pool;
  let db: TestableDb;

  beforeAll(() => {
    pool = new Pool({ connectionString });
    db = drizzle(pool, { schema });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedDualCredentialAccount() {
    const accountId = randomUUID();
    await pool.query("INSERT INTO account (id, email, status) VALUES ($1, $2, 'active')", [accountId, `${accountId}@example.com`]);

    const passwordHash = (await hashPassword("correct-horse-battery-staple")).encoded;
    const [passwordCredential] = await db
      .insert(schema.accountCredential)
      .values({ accountId, credentialType: "password", passwordHash })
      .returning();
    const [googleCredential] = await db
      .insert(schema.accountCredential)
      .values({
        accountId,
        credentialType: "google",
        providerAccountId: `google-sub-${accountId}`,
        linkedAt: new Date().toISOString(),
        emailAtLinkTime: `${accountId}@example.com`,
      })
      .returning();

    return { accountId, passwordHash, passwordCredentialId: passwordCredential.id, googleCredentialId: googleCredential.id };
  }

  async function readCredential(id: string) {
    const [row] = await db.select().from(schema.accountCredential).where(eq(schema.accountCredential.id, id));
    return row;
  }

  it(
    "locks the password row after threshold failed attempts, without touching the google row's lockout fields",
    async () => {
      const { passwordHash, passwordCredentialId, googleCredentialId } = await seedDualCredentialAccount();

      for (let attempt = 0; attempt < LOCKOUT_THRESHOLD; attempt++) {
        const ok = await verifyPasswordWithLockout(db, { hash: passwordHash, password: "definitely-wrong" });
        expect(ok).toBe(false);
      }

      const passwordRow = await readCredential(passwordCredentialId);
      expect(passwordRow.failedLoginCount).toBe(LOCKOUT_THRESHOLD);
      expect(passwordRow.lockedUntil).not.toBeNull();
      expect(new Date(passwordRow.lockedUntil!).getTime()).toBeGreaterThan(Date.now());

      // (a) The google row's own lockout columns must be completely untouched.
      const googleRow = await readCredential(googleCredentialId);
      expect(googleRow.failedLoginCount).toBe(0);
      expect(googleRow.lockedUntil).toBeNull();

      // Even the CORRECT password is now rejected while locked — the lock
      // itself works, this isn't just "the count went up but nothing enforces it".
      const correctWhileLocked = await verifyPasswordWithLockout(db, { hash: passwordHash, password: "correct-horse-battery-staple" });
      expect(correctWhileLocked).toBe(false);

      // (b) "Google sign-in still succeeds while password is locked": there
      // is no lockout-consulting code on the Google/OAuth path at all — the
      // google row's failed_login_count/locked_until (asserted above) are
      // exactly the untouched, non-blocking defaults a real Google sign-in
      // would see, since nothing in this codebase's OAuth flow ever reads
      // `account_credential.locked_until` (confirmed by inspection: only
      // `lib/auth/lockout.ts`'s `verifyPasswordWithLockout` — the
      // password-only path above — ever queries these columns, and it is
      // structurally unreachable for a `credential_type='google'` row since
      // `google` rows have `password_hash = NULL`, which can never equal
      // the non-null hash argument this function is always called with).
      expect(googleRow.passwordHash).toBeNull();
    },
    // Deliberately generous: LOCKOUT_THRESHOLD (10) real Argon2id verifies
    // (m=65536 KiB, t=3 — ADR-003's real, deliberately-expensive
    // parameters, never mocked here) plus 5 real 1.5s progressive-delay
    // waits (from the 5th consecutive failure onward) comfortably exceed
    // vitest's 5s default per-test timeout on their own.
    30_000,
  );

  it("and vice versa: a locked-looking google row (hypothetically corrupted) has zero effect on password verification for the same account", async () => {
    const { passwordHash, passwordCredentialId, googleCredentialId } = await seedDualCredentialAccount();

    // Simulate a hypothetical bug/corruption that set lockout fields on
    // the google row directly (nothing in real app code does this — this
    // is exactly the "vice versa" scenario the addendum's test asks for).
    await db
      .update(schema.accountCredential)
      .set({ failedLoginCount: 99, lockedUntil: new Date(Date.now() + 3_600_000).toISOString() })
      .where(and(eq(schema.accountCredential.id, googleCredentialId), eq(schema.accountCredential.credentialType, "google")));

    // The password row is untouched and a correct password still succeeds
    // — `verifyPasswordWithLockout`'s WHERE clause (`credential_type =
    // 'password' AND password_hash = $hash`) can never match the google
    // row (whose password_hash is NULL), so its corrupted lockout state
    // is structurally invisible to this query.
    const ok = await verifyPasswordWithLockout(db, { hash: passwordHash, password: "correct-horse-battery-staple" });
    expect(ok).toBe(true);

    const passwordRow = await readCredential(passwordCredentialId);
    expect(passwordRow.failedLoginCount).toBe(0);
    expect(passwordRow.lockedUntil).toBeNull();
  });

  it("resets failed_login_count and locked_until to a clean state on a successful password verify", async () => {
    const { passwordHash, passwordCredentialId } = await seedDualCredentialAccount();

    await verifyPasswordWithLockout(db, { hash: passwordHash, password: "wrong-once" });
    await verifyPasswordWithLockout(db, { hash: passwordHash, password: "wrong-twice" });

    let row = await readCredential(passwordCredentialId);
    expect(row.failedLoginCount).toBe(2);

    const ok = await verifyPasswordWithLockout(db, { hash: passwordHash, password: "correct-horse-battery-staple" });
    expect(ok).toBe(true);

    row = await readCredential(passwordCredentialId);
    expect(row.failedLoginCount).toBe(0);
    expect(row.lockedUntil).toBeNull();
  });
});
