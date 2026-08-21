/**
 * Integration test against a REAL Postgres instance, driving Better
 * Auth's ACTUAL internal adapter (`(await getAuth().$context).internalAdapter`)
 * with a realistic Google-shaped profile — the same `createUser`/
 * `createAccount` calls `node_modules/better-auth/dist/oauth2/link-account.mjs`
 * makes for a brand-new Google sign-up (confirmed by reading that file).
 * Written to reproduce, without a live OAuth round trip, the real bug a
 * live click-through found: a first-time Google sign-up 500'd with
 * `[Better Auth]: unable_to_create_user`, which turned out to wrap a
 * swallowed `BetterAuthError` — Better Auth's core `user` model always
 * includes a nullable `image` field, Google's OAuth profile always
 * populates it, and `account` (`loginAccount`) had no column for it.
 *
 * Deliberately run against a FRESH THROWAWAY local Docker Postgres, not
 * the real Neon database now in `.env.local` — same reasoning as the
 * other `*.integration.test.ts` files' env-var-gated pattern, but this
 * one additionally needs `DATABASE_DRIVER=local-pg`/`BETTER_AUTH_*`/
 * `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` set (not just a bare
 * connection string) because it builds the REAL `getAuth()` instance —
 * the actual field mappings, hooks, and social-provider config, not a
 * reimplementation of them. Google credentials can be non-functional
 * placeholders: `createUser`/`createAccount` never talk to Google, only
 * the token-exchange step (not exercised here) would.
 *
 * Run locally:
 *   docker run -d --name medtracking-test-pg -e POSTGRES_PASSWORD=testpass \
 *     -e POSTGRES_DB=medtracking_test -p 55432:5432 postgres:17
 *   DATABASE_URL_DIRECT=postgresql://postgres:testpass@localhost:55432/medtracking_test \
 *     pnpm exec tsx lib/db/migrate.ts
 *   OAUTH_IT_DATABASE_URL=postgresql://postgres:testpass@localhost:55432/medtracking_test \
 *     pnpm test
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

const connectionString = process.env.OAUTH_IT_DATABASE_URL;

describe.skipIf(!connectionString)("Better Auth's real internal adapter creates a Google-sourced user+account+profile (regression: unable_to_create_user)", () => {
  let pool: Pool;
  let readDb: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(() => {
    // Matches what `lib/db/client.ts`'s `getDb()` needs to pick the local
    // `pg`-backed driver instead of the Neon HTTP driver — see that
    // module's `shouldUseLocalPgDriver()`. `NODE_ENV` is already "test"
    // under vitest by default (and the gate only requires "not
    // production"), so it's read, not set, here.
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
    readDb = drizzle(pool, { schema });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates account (with avatar_url) + account_credential(credential_type='google', tokens NULL) + profile, with no thrown error", async () => {
    // Fresh module registry per test file under vitest's default
    // isolation, so this is the first time `getEnv()`/`getAuth()` run in
    // this process — safe to rely on the env vars set in `beforeAll`
    // above being what they read.
    const { getAuth } = await import("@/lib/auth/config");
    const auth = getAuth();
    const context = await auth.$context;
    const internalAdapter = context.internalAdapter;

    const googleEmail = `google-user-${randomUUID()}@example.com`;
    const googleSub = `google-sub-${randomUUID()}`;
    const avatarUrl = "https://lh3.googleusercontent.com/a/fake-avatar-for-test";

    // Exact shape `link-account.mjs`'s new-account branch builds from a
    // real Google profile (`userInfo.name`/`.image`/`.email`/
    // `.emailVerified`) — `image` is the field that used to break this.
    const createdUser = await internalAdapter.createUser(
      {
        name: "Google Test User",
        image: avatarUrl,
        email: googleEmail,
        emailVerified: true,
      },
      { method: "oauth", oauth: { providerId: "google", profile: { email: googleEmail, name: "Google Test User" } } },
    );

    // Exact shape of `accountData` in `link-account.mjs`'s new-account
    // branch: providerId/issuer/accountId from `resolveOAuthAccountKey`
    // (unset `accountIssuer` config -> `createOAuthAccountIssuer("google")`
    // = `"local:oauth:google"`, confirmed by reading
    // `oauth2/account-key.mjs`), plus real-looking-but-fake tokens (which
    // must NOT survive — see the assertions below).
    const createdAccount = await internalAdapter.createAccount({
      userId: createdUser.id,
      providerId: "google",
      issuer: "local:oauth:google",
      accountId: googleSub,
      accessToken: "ya29.fake-access-token-should-never-be-persisted",
      refreshToken: undefined,
      idToken: "eyJ.fake-id-token-should-never-be-persisted",
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      refreshTokenExpiresAt: undefined,
      scope: "openid email profile",
    });

    expect(createdUser.id).toBeTruthy();
    expect(createdAccount).toBeTruthy();

    // account (loginAccount): avatar_url actually landed, not dropped/errored.
    const [accountRow] = await readDb.select().from(schema.account).where(eq(schema.account.id, createdUser.id));
    expect(accountRow.email).toBe(googleEmail);
    expect(accountRow.avatarUrl).toBe(avatarUrl);

    // account_credential: real google row, tokens stripped to NULL by
    // `databaseHooks.account.create.before` (addendum A.3), scoped
    // correctly (credential_type='google', provider_account_id=googleSub).
    const [credentialRow] = await readDb
      .select()
      .from(schema.accountCredential)
      .where(eq(schema.accountCredential.loginAccountId, createdUser.id));
    expect(credentialRow.credentialType).toBe("google");
    expect(credentialRow.providerAccountId).toBe(googleSub);
    expect(credentialRow.oauthAccessToken).toBeNull();
    expect(credentialRow.oauthRefreshToken).toBeNull();
    expect(credentialRow.oauthIdToken).toBeNull();
    expect(credentialRow.oauthScope).toBeNull();
    expect(credentialRow.oauthAccessTokenExpiresAt).toBeNull();
    expect(credentialRow.oauthRefreshTokenExpiresAt).toBeNull();
    // Never a password-specific write for an OAuth-only account.
    expect(credentialRow.passwordHash).toBeNull();

    // profile: `databaseHooks.user.create.after` (Phase "6.5") fires for
    // OAuth-created users too, per ADR-003 addendum A.6 — same hook, same
    // `user`-model `create` path regardless of auth strategy.
    const [profileRow] = await readDb.select().from(schema.profile).where(eq(schema.profile.ownerAccountId, createdUser.id));
    expect(profileRow).toBeTruthy();

    // Note: NOT asserting a `user_preferences` row — nothing in this
    // codebase creates one at account-creation time (only the sync layer
    // upserts one lazily on the first preference write). The task brief
    // describing this hook as creating "profile/user_preferences rows"
    // doesn't match current behavior; flagged here rather than silently
    // asserting something that isn't actually true.
  },
  // Generous, non-default timeout: this exercises the whole real Better
  // Auth instance construction plus multiple real DB round trips
  // (createUser, createAccount, the create.after profile-creation hook's
  // own write), comfortably slower than vitest's 5s default.
  20_000,
  );
});
