/**
 * Integration test against a REAL Postgres instance, driving Better
 * Auth's ACTUAL internal adapter methods that the real OAuth callback
 * flow calls for a REPEAT sign-in to an already-linked Google account —
 * not just the first-time creation path
 * (`oauth-user-creation.integration.test.ts` covers that one).
 *
 * Regression test for a real bug found via a live repeat-Google-sign-in
 * click-through (2026-08-22): first sign-in worked, a second sign-in to
 * the SAME already-linked account failed with "[Better Auth]: Better
 * Auth was unable to query your database." Root cause: several Better
 * Auth internal lookups (`findAccountOwnerByKey`, `findUserByEmail` with
 * `includeAccounts: true`, `findSession`/`findSessions`) ask the adapter
 * to JOIN a base row to its related row via Drizzle's relational query
 * API (`db.query.<model>.findFirst({ with: { <relation>: true } })`),
 * which requires `relations()` to be declared — this schema never had
 * any. The join is only actually ATTEMPTED when a matching base row
 * exists to expand, which structurally can't happen on a first sign-in
 * (no prior `account_credential` row) but always happens on a repeat one
 * — exactly matching "first works, repeat breaks". Fixed by adding
 * `lib/db/schema.ts`'s `accountRelations`/`accountCredentialRelations`/
 * `accountSessionRelations`.
 *
 * `findAccountOwnerByKey` directly reproduces the reported repeat-sign-in
 * failure. `findUserByEmail(..., { includeAccounts: true })` is the SAME
 * bug class hitting the addendum A.5 same-email-collision-rejection path
 * (an unauthenticated Google sign-in whose email matches an existing
 * account) — also verified here since it uses an identical join shape
 * and was never actually live-tested end to end (the redirect_uri
 * mismatch blocked that check earlier in this project's history).
 *
 * Run locally: same throwaway-Postgres setup as
 * `oauth-user-creation.integration.test.ts` — see that file's header.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const connectionString = process.env.OAUTH_IT_DATABASE_URL;

describe.skipIf(!connectionString)("Better Auth's real internal adapter joins survive a repeat sign-in (regression: unable to query your database)", () => {
  let pool: Pool;

  beforeAll(() => {
    process.env.DATABASE_DRIVER = "local-pg";
    process.env.DATABASE_URL = connectionString;
    process.env.DATABASE_URL_DIRECT = connectionString;
    process.env.BETTER_AUTH_SECRET ??= "test-only-secret-not-for-production-use-32chars";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    process.env.BETTER_AUTH_TRUSTED_ORIGINS ??= "http://localhost:3000";
    process.env.IP_HASH_PEPPER ??= "test-only-pepper-not-for-production-use-32chars";
    process.env.GOOGLE_CLIENT_ID ??= "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";

    pool = new Pool({ connectionString });
  });

  afterAll(async () => {
    await pool.end();
  });

  it(
    "findAccountOwnerByKey (the exact call the OAuth callback makes on every sign-in) succeeds and finds the owner on a REPEAT lookup, not just a first miss",
    async () => {
      const { getAuth } = await import("@/lib/auth/config");
      const auth = getAuth();
      const internalAdapter = (await auth.$context).internalAdapter;

      const googleEmail = `repeat-google-user-${randomUUID()}@example.com`;
      const googleSub = `google-sub-${randomUUID()}`;
      const issuer = "local:oauth:google";

      // A MISS (no matching row yet) must not throw either — this is the
      // first-sign-in shape of the same call, confirming the fix didn't
      // just move the bug to only work when a row exists.
      const miss = await internalAdapter.findAccountOwnerByKey({ issuer, accountId: googleSub });
      expect(miss).toBeNull();

      // Create the user + linked google credential exactly as the real
      // first-sign-in flow does (same calls as
      // oauth-user-creation.integration.test.ts).
      const createdUser = await internalAdapter.createUser(
        { name: "Repeat Google User", image: "https://lh3.googleusercontent.com/a/fake", email: googleEmail, emailVerified: true },
        { method: "oauth", oauth: { providerId: "google", profile: { email: googleEmail, name: "Repeat Google User" } } },
      );
      await internalAdapter.createAccount({
        userId: createdUser.id,
        providerId: "google",
        issuer,
        accountId: googleSub,
        accessToken: "fake-access-token",
        idToken: "fake-id-token",
        scope: "openid email profile",
      });

      // THE REPEAT-SIGN-IN CALL: a matching row now exists, so the join
      // actually gets attempted — this is exactly where it 500'd before
      // the fix.
      const hit = await internalAdapter.findAccountOwnerByKey({ issuer, accountId: googleSub });

      expect(hit).not.toBeNull();
      expect(hit?.kind).toBe("owned");
      if (hit?.kind === "owned") {
        expect(hit.user.id).toBe(createdUser.id);
        expect(hit.user.email).toBe(googleEmail);
        expect(hit.account.accountId).toBe(googleSub);
      }
    },
    20_000,
  );

  it(
    "findUserByEmail({ includeAccounts: true }) — the A.5 same-email-collision check — also survives the join once a matching account exists",
    async () => {
      const { getAuth } = await import("@/lib/auth/config");
      const auth = getAuth();
      const internalAdapter = (await auth.$context).internalAdapter;

      const email = `existing-password-user-${randomUUID()}@example.com`;

      // A brand-new email/password-style user (no linked google account).
      const createdUser = await internalAdapter.createUser(
        { name: "Existing Password User", email, emailVerified: false },
        { method: "email-password" },
      );

      const result = await internalAdapter.findUserByEmail(email, { includeAccounts: true });

      expect(result).not.toBeNull();
      expect(result?.user.id).toBe(createdUser.id);
      // No linked accounts yet — an empty array, not a thrown error.
      expect(result?.accounts).toEqual([]);
    },
    20_000,
  );
});
