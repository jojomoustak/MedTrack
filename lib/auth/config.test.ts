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
    },
    // Builds the real, full Better Auth instance (first call in this file
    // pays that one-time cost; every other `it` here reuses the cached
    // `authSingleton`) — generous headroom over the 5s default so this
    // doesn't flake under a loaded CI/full-suite parallel run.
    15_000,
  );

  it("leaves autoSignIn/requireEmailVerification exactly as ADR-003 §5's grace period requires — never reopened by this task", async () => {
    const { getAuth } = await import("@/lib/auth/config");
    const auth = getAuth();

    expect(auth.options.emailAndPassword?.autoSignIn).toBe(true);
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(false);
  });

  it("does NOT configure onExistingUserSignUp — confirmed unreachable under this app's grace-period config (requireEmailVerification=false, autoSignIn=true), so it is deliberately left unset rather than wired as dead code", async () => {
    const { getAuth } = await import("@/lib/auth/config");
    const auth = getAuth();

    // `auth.options` is typed as the exact literal this module passed to
    // `betterAuth(...)`, which (by design, per this test) never sets this
    // key — cast to a loose record to assert its absence at runtime rather
    // than fighting the narrowed literal type for a property that, by
    // construction, isn't part of it.
    const emailAndPassword = auth.options.emailAndPassword as Record<string, unknown> | undefined;
    expect(emailAndPassword?.onExistingUserSignUp).toBeUndefined();
  });

  it("wires sendResetPassword and onPasswordReset (the lockout escape hatch) as functions", async () => {
    const { getAuth } = await import("@/lib/auth/config");
    const auth = getAuth();

    expect(typeof auth.options.emailAndPassword?.sendResetPassword).toBe("function");
    expect(typeof auth.options.emailAndPassword?.onPasswordReset).toBe("function");
  });

  it("sends a verification email on every sign-up without gating login (sendOnSignUp, not requireEmailVerification)", async () => {
    const { getAuth } = await import("@/lib/auth/config");
    const auth = getAuth();

    expect(auth.options.emailVerification?.sendOnSignUp).toBe(true);
    expect(auth.options.emailVerification?.autoSignInAfterVerification).toBe(true);
    expect(typeof auth.options.emailVerification?.sendVerificationEmail).toBe("function");
  });
});
