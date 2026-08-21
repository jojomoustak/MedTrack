/**
 * Better Auth instance, configured per ADR-003 exactly:
 *   - self-hosted, backed directly by the Neon Postgres already used for
 *     domain data (no second vendor/data store);
 *   - schema mapped onto this project's own `account` / `account_session`
 *     / `account_credential` / `account_verification` tables (see
 *     `lib/db/schema.ts`), not Better Auth's default generated names;
 *   - Argon2id password hashing at the ADR-003 parameters
 *     (`m=65536 KiB, t=3, p=1`) via `lib/auth/argon2.ts`, never Better
 *     Auth's own default hasher;
 *   - session cookie-cache plugin left disabled, full stop (security
 *     review resolution §2);
 *   - 30-day sliding idle timeout / 90-day absolute session lifetime
 *     (security review resolution §1) — Better Auth's own `expiresIn` is
 *     the absolute lifetime; the idle/sliding piece is `updateAge`, the
 *     interval at which an active session's `expiresAt` gets pushed
 *     forward, capped by the hard 90-day ceiling via the
 *     `session.create.before`/`update.before` hooks below (Better Auth
 *     has no native "sliding window with a hard ceiling" primitive, so
 *     the ceiling is enforced here, not just documented).
 *
 * MUST run in the Node.js Vercel Functions runtime (Argon2id needs
 * `node:crypto`'s built-in implementation) — the route handler that
 * exposes this (`app/api/auth/[...all]/route.ts`) sets
 * `export const runtime = "nodejs"`.
 *
 * Lockout (security review resolution §1: 10 consecutive failed
 * password attempts -> 15-minute lock, progressive delay from the 5th) is
 * wired via `emailAndPassword.password.verify` -> `lib/auth/lockout.ts`,
 * added alongside the 2026-08-21 "Sign in with Google" addendum because
 * that addendum's A.6 made per-`credential_type`-scoping a hard,
 * tested requirement. Still NOT built: distinct lockout-vs-wrong-password
 * UI messaging (needs `ux-accessibility-designer`) and the
 * password-reset escape hatch (no reset flow exists yet) — both remain
 * follow-ups, unchanged from the original Phase 4 deferral.
 *
 * Google Sign-In (ADR-003 addendum, 2026-08-21) is configured below via
 * `socialProviders.google` + `account.accountLinking` — see the addendum
 * (`docs/adr/ADR-003-authentication.md`, "Addendum (2026-08-21)") for the
 * full design and its security review resolution.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "@/lib/db/client";
import { withProfileScope } from "@/lib/db/rls";
import * as schema from "@/lib/db/schema";
import { getEnv } from "@/lib/config/env";
import { hashPassword } from "@/lib/auth/argon2";
import { verifyPasswordWithLockout } from "@/lib/auth/lockout";
import { stripOAuthTokens } from "@/lib/auth/oauth-token-strip";
import { withHashedSessionTokenAdapter } from "@/lib/auth/adr003-adapter";
import { emailVerifiedTimestampPlugin } from "@/lib/auth/email-verified-plugin";
import { logger } from "@/lib/logging/logger";

const POSTGRES_UNIQUE_VIOLATION = "23505";

/**
 * Phase 2 §0/§2.2: `Profile` (the medical-data owner) is 1:1 with
 * `Account` at MVP but is deliberately a SEPARATE row Better Auth knows
 * nothing about — it only manages the login identity (`account`).
 * Nothing else creates this row, so it must happen here, right after
 * account creation, or every subsequent authenticated request fails
 * `lib/auth/session.ts`'s "re-derive account_id -> profile_id" step with
 * a 401 — found by an actual register -> Today click-through in a
 * browser, not by a unit test (every prior integration test seeded both
 * rows by hand via admin SQL, never exercising the real sign-up path).
 *
 * Inserted via `withProfileScope` using a freshly generated id as BOTH
 * the new row's `id` and the RLS context: `profile`'s policy is
 * `id = current_setting('app.current_profile_id')::uuid`, which the
 * inserted row satisfies by construction — there is no chicken-and-egg
 * problem, since we choose the id before writing it.
 */
async function createProfileForNewAccount(accountId: string): Promise<void> {
  const profileId = crypto.randomUUID();
  try {
    await withProfileScope(profileId, (db) => [db.insert(schema.profile).values({ id: profileId, ownerAccountId: accountId })]);
    logger.info("auth.profile.create", { accountId });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // A profile already exists for this account (e.g. a retried
      // create.after hook) — the 1:1 invariant already holds, nothing to do.
      logger.debug("auth.profile.create.already_exists", { accountId });
      return;
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION;
}

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const NINETY_DAYS_SECONDS = 60 * 60 * 24 * 90;

let authSingleton: ReturnType<typeof buildAuth> | undefined;

// Better Auth reserves "user"/"session"/"account"/"verification" as
// canonical model keys — a custom `modelName` that collides with one of
// them is NOT treated as an alias, it resolves to the built-in model of
// the same name instead (confirmed by reading
// `@better-auth/core`'s `getDefaultModelName`, which explicitly documents
// "an exact schema-key match must win over a modelName match", and by
// reproducing the resulting `BetterAuthError: Field email not found in
// model account` against a live Postgres instance). Since this project's
// `account` table (Phase 2 §2.1) is the *login identity* Better Auth
// calls `user`, its modelName can't literally be `"account"` — that
// string is already Better Auth's own reserved name for the
// per-credential model. `loginAccount` is therefore used ONLY as the
// internal Better Auth model-name string; the actual Postgres table is
// still named `account` exactly per Phase 2/ADR-003 (see the schema
// aliasing below — this is a naming collision in Better Auth's config
// surface, not a schema change).
const authSchema = {
  loginAccount: schema.account,
  accountSession: schema.accountSession,
  accountCredential: schema.accountCredential,
  accountVerification: schema.accountVerification,
};

function buildAuth() {
  const env = getEnv();
  const db = getDb();

  const baseAdapter = drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
    usePlural: false,
  });
  const adapter = withHashedSessionTokenAdapter(baseAdapter);

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // ADR-003 §"CSRF posture": locked to the production domain(s) only —
    // never left on a permissive/dev default in production config.
    trustedOrigins: env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((origin) => origin.trim()),

    database: adapter,

    advanced: {
      database: {
        // Every id column in this schema is a native Postgres `uuid`
        // (Phase 2 §0) — Better Auth's default id generator produces a
        // non-UUID string, which would fail on insert.
        generateId: "uuid",
      },
    },

    user: {
      modelName: "loginAccount",
      fields: {
        name: "displayName",
        // Found via a REAL Google OAuth click-through (2026-08-21):
        // Better Auth's core `user` model always includes a nullable
        // `image` field, and Google's OAuth profile always populates it
        // (email/password sign-up never sends one, which is why this went
        // unexercised until a live round-trip) — mapped to a genuinely
        // new column (`lib/db/schema.ts`'s `account.avatarUrl`) rather
        // than left unmapped, since an unmapped core field still gets
        // written by the adapter and errors if no column exists for it.
        image: "avatarUrl",
        // `emailVerified` (boolean) <-> `email_verified_at` (timestamptz)
        // conversion is handled by `emailVerifiedTimestampPlugin` below,
        // which fully overrides this field's schema (type + fieldName +
        // transform) — do not also rename it here, the plugin's
        // `fieldName` takes care of that.
      },
    },

    session: {
      modelName: "accountSession",
      fields: {
        userId: "accountId",
        token: "tokenHash", // stores HASH(token) only — see adr003-adapter.ts
        ipAddress: "ipHash", // HMAC'd, not raw — see lib/auth/session.ts for the write path
        userAgent: "userAgent",
        // Better Auth's core schema requires every model to have
        // `updatedAt` (confirmed live: `account_session` has no bare
        // updated_at column per ADR-003). `last_seen_at` already tracks
        // exactly this ("when was this session row last touched"), so it
        // maps 1:1 in meaning rather than needing a redundant column.
        updatedAt: "lastSeenAt",
      },
      expiresIn: NINETY_DAYS_SECONDS, // absolute lifetime ceiling
      updateAge: THIRTY_DAYS_SECONDS <= NINETY_DAYS_SECONDS ? 60 * 60 * 24 : 0, // refresh at most once/day of activity
      // Cookie-cache plugin: left unset/disabled, full stop, at MVP —
      // security review resolution §2. Do not enable without a fresh
      // security-privacy-reviewer pass (see module doc above).
      cookieCache: { enabled: false },
    },

    // Better Auth's own "account" model = one row per credential/provider.
    // Maps onto this project's `account_credential` (ADR-003 + the
    // 2026-08-21 "Sign in with Google" addendum, A.2/A.4).
    // `issuer`/`accountId` (Better Auth's provider-scoped identity, not
    // this project's login identity) map to `provider_issuer`/
    // `provider_account_id` — the Phase 4 addition documented in
    // lib/db/schema.ts's `accountCredential` table comment; Google's
    // stable `sub` claim lands in the same `provider_account_id` column
    // (addendum A.2, no separate column needed). The `oauth_*` fields
    // below exist only because Better Auth's adapter needs a write target
    // for them (addendum A.3) — `databaseHooks.account.create.before`/
    // `update.before` below null them out on every write, so they are
    // mapped but never actually persisted with real values.
    // Addendum A.4/A.5: Google is an *additional* login method, not a
    // replacement — email/password (below) stays enabled unchanged.
    // Explicit, session-authenticated linking only
    // (`disableImplicitLinking: true`): a logged-in user can link Google
    // from Profile settings (`linkSocial()`); an unauthenticated visitor
    // whose Google email matches an existing account is rejected, never
    // auto-linked (A.5's account-takeover rationale, independently
    // confirmed by the security review as defense-in-depth against a real
    // CVE, CVE-2026-53516/GHSA-g38m-r43w-p2q7, already covered by this
    // project's existing `>=1.6.11` version floor).
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        // No `accessType: "offline"` (addendum A.3 point 1) — Google
        // never issues a refresh token for this flow, so there is nothing
        // to accidentally persist. Scopes: openid/email/profile only,
        // Better Auth's default for this provider — never widened.
      },
    },
    account: {
      modelName: "accountCredential",
      fields: {
        userId: "accountId",
        providerId: "credentialType",
        password: "passwordHash",
        issuer: "providerIssuer",
        accountId: "providerAccountId",
        accessToken: "oauthAccessToken",
        refreshToken: "oauthRefreshToken",
        idToken: "oauthIdToken",
        scope: "oauthScope",
        accessTokenExpiresAt: "oauthAccessTokenExpiresAt",
        refreshTokenExpiresAt: "oauthRefreshTokenExpiresAt",
      },
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
      },
    },

    verification: {
      modelName: "accountVerification",
      fields: {
        identifier: "purpose",
        value: "tokenHash",
      },
    },

    emailAndPassword: {
      enabled: true,
      // Argon2id per ADR-003, never Better Auth's own default hasher.
      password: {
        hash: async (password: string) => (await hashPassword(password)).encoded,
        // Wrapped with lockout bookkeeping (ADR-003 §"Security review
        // resolution" item 1 / addendum A.6) — `lib/auth/lockout.ts`
        // scopes every read/write of `failed_login_count`/`locked_until`
        // to `credential_type = 'password'` explicitly, never "the
        // account's credential row" by `account_id` alone, so a linked
        // Google row on the same account can never be locked/unlocked by
        // a password attempt or vice versa.
        verify: async ({ hash, password }: { hash: string; password: string }) => verifyPasswordWithLockout(db, { hash, password }),
      },
      // ADR-003 §5 "Email-verification-before-login policy": grace period,
      // not a login gate — account creation logs the user in immediately.
      autoSignIn: true,
      requireEmailVerification: false,
    },

    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await createProfileForNewAccount(user.id);
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            logger.info("auth.session.create", { accountId: session.userId });
            return { data: session };
          },
        },
      },
      // Addendum A.3 (corrected during security review, item 2): BOTH
      // `create.before` AND `update.before` are required, not just the
      // first-sign-in `create` path. Every *repeat* Google sign-in to an
      // already-linked account goes through Better Auth's `account.update`
      // (it refreshes the linked row's token fields in place), which
      // `create.before` never sees — the review found this is the common
      // case on every returning user, not a rare edge case. Both hooks
      // null out the same token fields before the row is written, so
      // `oauth_access_token`/`oauth_refresh_token`/`oauth_id_token`/
      // `oauth_scope`/`oauth_access_token_expires_at`/
      // `oauth_refresh_token_expires_at` are always NULL regardless of
      // which path wrote the row (data minimization — MedTracking needs
      // Google identity, never ongoing API access, see A.3).
      account: {
        create: {
          before: async (account) => ({ data: stripOAuthTokens(account) }),
        },
        update: {
          before: async (account) => ({ data: stripOAuthTokens(account) }),
        },
      },
    },

    plugins: [emailVerifiedTimestampPlugin],
  });
}

/** Lazy singleton — never constructed at module-import time (see lib/config/env.ts doc). */
export function getAuth(): ReturnType<typeof buildAuth> {
  if (!authSingleton) authSingleton = buildAuth();
  return authSingleton;
}
