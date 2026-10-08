import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { extractSessionToken } from "@/lib/auth/session";

const SECRET = "unit-test-secret-at-least-32-characters";

/** A cookie value exactly as Better Auth sets it: `<token>.<base64 HMAC-SHA256(secret, token)>`, URL-encoded. */
function signed(token: string, secret = SECRET): string {
  const signature = createHmac("sha256", secret).update(token, "utf8").digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

/**
 * Regression test for a real bug found via a live-site smoke test on the
 * deployed HTTPS Vercel app: Better Auth transparently prefixes the
 * session cookie name with `__Secure-` whenever `BETTER_AUTH_URL` starts
 * with `https://` (every real deployment) — a previous version of
 * `extractSessionToken` hardcoded the unprefixed name, so every
 * authenticated request 401'd on the live site even immediately after a
 * fully successful sign-in, while appearing to work fine against local
 * HTTP dev (which never gets the `__Secure-` prefix). `extractSessionToken`
 * now delegates to Better Auth's own public `getSessionCookie`
 * (`better-auth/cookies`), which checks both forms unconditionally — see
 * `lib/auth/session.ts`'s doc comment for the full root-cause trace.
 */
describe("extractSessionToken", () => {
  it("finds the token under the unprefixed cookie name (local HTTP dev, BETTER_AUTH_URL without https://)", () => {
    expect(extractSessionToken(`better-auth.session_token=${signed("abc123token")}; other=irrelevant`, SECRET)).toBe("abc123token");
  });

  it("finds the token under the __Secure- prefixed cookie name (deployed HTTPS, BETTER_AUTH_URL starting with https://)", () => {
    expect(extractSessionToken(`__Secure-better-auth.session_token=${signed("xyz789token")}; other=irrelevant`, SECRET)).toBe("xyz789token");
  });

  it("prefers the __Secure- form when (implausibly) both are somehow present", () => {
    const header = `__Secure-better-auth.session_token=${signed("secureToken")}; better-auth.session_token=${signed("plainToken")}`;
    expect(extractSessionToken(header, SECRET)).toBe("secureToken");
  });

  it("URL-decodes the cookie value before checking the signature", () => {
    // Base64 signatures contain '+', '/' and '='; Better Auth URL-encodes the whole value.
    expect(extractSessionToken(`better-auth.session_token=${signed("tok+plus")}`, SECRET)).toBe("tok+plus");
  });

  describe("signature (security review, 2026-10-08)", () => {
    it("rejects a bare token with no signature — a leaked token alone must not authenticate", () => {
      expect(extractSessionToken("better-auth.session_token=abc123token", SECRET)).toBeNull();
    });

    it("rejects a token with a signature that doesn't verify", () => {
      const forged = encodeURIComponent(`abc123token.${"A".repeat(43)}=`);
      expect(extractSessionToken(`better-auth.session_token=${forged}`, SECRET)).toBeNull();
    });

    it("rejects a token signed with a different secret", () => {
      expect(extractSessionToken(`better-auth.session_token=${signed("abc123token", "some-other-secret-of-32-characters!!")}`, SECRET)).toBeNull();
    });

    it("rejects another token's signature moved onto this token", () => {
      const otherSignature = decodeURIComponent(signed("victimToken")).split(".")[1];
      expect(extractSessionToken(`better-auth.session_token=${encodeURIComponent(`attackerToken.${otherSignature}`)}`, SECRET)).toBeNull();
    });
  });

  it("returns null when the cookie header is null", () => {
    expect(extractSessionToken(null, SECRET)).toBeNull();
  });

  it("returns null when no session cookie (prefixed or not) is present", () => {
    expect(extractSessionToken("some_other_cookie=value; another=thing", SECRET)).toBeNull();
  });

  it("returns null for an empty cookie header string", () => {
    expect(extractSessionToken("", SECRET)).toBeNull();
  });
});
