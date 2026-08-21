import { describe, expect, it } from "vitest";
import { stripOAuthTokens } from "@/lib/auth/oauth-token-strip";

/**
 * ADR-003 addendum A.3 / security review resolution item 2 — mandatory
 * test: "after a Google sign-in, `SELECT oauth_access_token FROM
 * account_credential WHERE credential_type='google'` is always NULL",
 * extended (per the review's correction) to cover a SECOND/repeat sign-in
 * as well as the first, since `account.update.before` (the repeat-sign-in
 * path) is a required hook, not a conditional one.
 *
 * This exercises the exact function wired into both
 * `databaseHooks.account.create.before` (first sign-in) and
 * `account.update.before` (every repeat sign-in) in `lib/auth/config.ts`
 * — see that module's doc comment for why the *wiring itself* still needs
 * a live OAuth round trip to fully confirm end-to-end (not available in
 * this environment), while the stripping LOGIC those hooks both call is
 * fully covered here.
 */
describe("stripOAuthTokens", () => {
  it("nulls every OAuth token/scope/expiry field on a first sign-in (create) payload", () => {
    const firstSignInPayload = {
      userId: "account-1",
      providerId: "google",
      accountId: "google-sub-123",
      accessToken: "ya29.real-looking-access-token",
      refreshToken: "1//real-looking-refresh-token",
      idToken: "eyJhbGciOiJSUzI1NiIsImtpZCI6...",
      scope: "openid email profile",
      accessTokenExpiresAt: new Date(),
      refreshTokenExpiresAt: new Date(),
    };

    const result = stripOAuthTokens(firstSignInPayload);

    expect(result.accessToken).toBeNull();
    expect(result.refreshToken).toBeNull();
    expect(result.idToken).toBeNull();
    expect(result.scope).toBeNull();
    expect(result.accessTokenExpiresAt).toBeNull();
    expect(result.refreshTokenExpiresAt).toBeNull();
    // Non-token identity fields must pass through unchanged.
    expect(result.userId).toBe("account-1");
    expect(result.providerId).toBe("google");
    expect(result.accountId).toBe("google-sub-123");
  });

  it("nulls every OAuth token/scope/expiry field on a SECOND/repeat sign-in (update) payload too", () => {
    // Shape of what Better Auth's callback handler sends to `account.update`
    // on a returning user (node_modules/better-auth/dist/api/routes/callback.mjs,
    // the `link` branch's `updateData`) — a fresh access token every time,
    // and a scope merged with whatever was previously granted.
    const repeatSignInPayload = {
      providerId: "google",
      accessToken: "ya29.a-DIFFERENT-real-looking-access-token-this-time",
      refreshToken: undefined,
      idToken: "eyJhbGciOiJSUzI1NiIsImtpZCI6...second-token",
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      refreshTokenExpiresAt: undefined,
      scope: "openid email profile",
    };

    const result = stripOAuthTokens(repeatSignInPayload);

    expect(result.accessToken).toBeNull();
    expect(result.refreshToken).toBeNull();
    expect(result.idToken).toBeNull();
    expect(result.scope).toBeNull();
    expect(result.accessTokenExpiresAt).toBeNull();
    expect(result.refreshTokenExpiresAt).toBeNull();
    expect(result.providerId).toBe("google");
  });

  it("is idempotent — stripping an already-stripped payload changes nothing further", () => {
    const once = stripOAuthTokens({ providerId: "google", accessToken: "leaked-token" });
    const twice = stripOAuthTokens(once);
    expect(twice).toEqual(once);
  });

  it("does not mutate the input object (returns a new object)", () => {
    const input = { providerId: "google", accessToken: "should-not-survive" };
    const result = stripOAuthTokens(input);
    expect(input.accessToken).toBe("should-not-survive"); // caller's original object untouched
    expect(result).not.toBe(input);
    expect(result.accessToken).toBeNull();
  });
});
