import { beforeEach, describe, expect, it } from "vitest";
import { __resetEnvCacheForTests } from "@/lib/config/env";

/**
 * Security audit follow-up (2026-09-15) — rate-limit / password-reset /
 * email-verification config wiring, tested at the "what did we actually
 * hand Better Auth" level rather than by driving a real HTTP request
 * against a live endpoint (no Docker/Postgres available in this
 * environment — see this task's report for what still needs live-DB
 * verification). `getAuth().options` is the raw options object this
 * module passed into `betterAuth(...)` (confirmed by reading
 * `node_modules/better-auth/dist/auth/base.mjs`'s `createBetterAuth`,
 * which returns `{ handler, fetch, api, options, $context, $ERROR_CODES }`
 * — `options` is the verbatim input, available synchronously, before any
 * DB connection is attempted), so this is a genuine assertion against the
 * real config object Better Auth will use, not a reimplementation of it.
 */
describe("lib/auth/config — rate limiting / password-reset / email-verification wiring", () => {
  beforeEach(() => {
    // `buildAuth()` needs the full required env shape (`lib/config/env.ts`)
    // — GOOGLE_CLIENT_ID/SECRET and ACCOUNT_ID_HASH_PEPPER aren't part of
    // `vitest.setup.mts`'s baseline, so set them here (same pattern as
    // `lib/medications/server/photo.test.ts`).
    process.env.GOOGLE_CLIENT_ID ??= "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";
    process.env.ACCOUNT_ID_HASH_PEPPER ??= "test-pepper-at-least-32-characters-long";
    __resetEnvCacheForTests();
  });

  it(
    "wires the exact ADR-003 §1 per-IP rate limit onto /sign-in/email, plus generous sign-up/reset-request rules, all database-persisted",
    async () => {
      const { getAuth } = await import("@/lib/auth/config");
      const auth = getAuth();

      expect(auth.options.rateLimit?.enabled).toBe(true);
      expect(auth.options.rateLimit?.storage).toBe("database");
      expect(auth.options.rateLimit?.modelName).toBe("rateLimit");
      // ADR-003 §"Security review resolution" item 1's literal requirement:
      // "≤20 login POSTs/IP/5 min across all accounts".
      expect(auth.options.rateLimit?.customRules?.["/sign-in/email"]).toEqual({ window: 300, max: 20 });
      expect(auth.options.rateLimit?.customRules?.["/sign-up/email"]).toEqual({ window: 3600, max: 10 });
      expect(auth.options.rateLimit?.customRules?.["/request-password-reset"]).toEqual({ window: 300, max: 5 });
      // Works without a session since 2026-10-20, so it can mail any unverified address.
      expect(auth.options.rateLimit?.customRules?.["/send-verification-email"]).toEqual({ window: 300, max: 3 });
    },
    // Builds the real, full Better Auth instance (first call in this file
    // pays that one-time cost; every other `it` here reuses the cached
    // `authSingleton`) — generous headroom over the 5s default so this
    // doesn't flake under a loaded CI/full-suite parallel run. ~2.7s alone;
    // 15s still timed out intermittently in full local runs (2026-10-05),
    // where parallel workers slow every cold import several-fold.
    45_000,
  );

  // Owner's call, 2026-10-20 (ADR-003 §5 amended): no account is used before its email is confirmed.
  it("requires a confirmed email before the first sign-in, and starts no session at sign-up", async () => {
    const { getAuth } = await import("@/lib/auth/config");
    const auth = getAuth();

    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(true);
    expect(auth.options.emailAndPassword?.autoSignIn).toBe(false);
  });

  it("tells the owner of an existing email about a sign-up with it (the sign-up itself is answered like a new one)", async () => {
    const { getAuth } = await import("@/lib/auth/config");
    const auth = getAuth();

    expect(typeof auth.options.emailAndPassword?.onExistingUserSignUp).toBe("function");
  });

  it("wires sendResetPassword and onPasswordReset (the lockout escape hatch) as functions", async () => {
    const { getAuth } = await import("@/lib/auth/config");
    const auth = getAuth();

    expect(typeof auth.options.emailAndPassword?.sendResetPassword).toBe("function");
    expect(typeof auth.options.emailAndPassword?.onPasswordReset).toBe("function");
  });

  // Security review 2026-10-20: a reset is how an address registered by someone else is taken back.
  it("a password reset signs out every session, and an account's email can't be changed (a reset also confirms the email)", async () => {
    const { getAuth } = await import("@/lib/auth/config");
    const auth = getAuth();

    expect(auth.options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
    // The reset token names the account, not the address it was mailed to: confirming on reset is only sound while the address is fixed.
    expect((auth.options.user as { changeEmail?: { enabled?: boolean } } | undefined)?.changeEmail?.enabled).not.toBe(true);
  });

  it("routes Better Auth's own logging through the app's logger at warn, never its console default", async () => {
    const { getAuth } = await import("@/lib/auth/config");
    const { betterAuthLogger } = await import("@/lib/auth/better-auth-logger");
    const auth = getAuth();

    expect(auth.options.logger).toBe(betterAuthLogger);
    expect(auth.options.logger?.level).toBe("warn");
  });

  it("sends the link on sign-up, not on each refused sign-in, and starts no session from the link (it opens in the browser, not the app)", async () => {
    const { getAuth } = await import("@/lib/auth/config");
    const auth = getAuth();

    expect(auth.options.emailVerification?.sendOnSignUp).toBe(true);
    expect((auth.options.emailVerification as Record<string, unknown> | undefined)?.sendOnSignIn).toBeUndefined();
    expect(auth.options.emailVerification?.autoSignInAfterVerification).toBe(false);
    expect(typeof auth.options.emailVerification?.sendVerificationEmail).toBe("function");
  });
});
