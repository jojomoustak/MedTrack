import { describe, expect, it } from "vitest";
import { extractSessionToken } from "@/lib/auth/session";

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
    const cookieHeader = "better-auth.session_token=abc123token.signatureHere; other=irrelevant";
    expect(extractSessionToken(cookieHeader)).toBe("abc123token");
  });

  it("finds the token under the __Secure- prefixed cookie name (deployed HTTPS, BETTER_AUTH_URL starting with https://)", () => {
    const cookieHeader = "__Secure-better-auth.session_token=xyz789token.signatureHere; other=irrelevant";
    expect(extractSessionToken(cookieHeader)).toBe("xyz789token");
  });

  it("prefers the __Secure- form when (implausibly) both are somehow present", () => {
    const cookieHeader = "__Secure-better-auth.session_token=secureToken.sig; better-auth.session_token=plainToken.sig";
    expect(extractSessionToken(cookieHeader)).toBe("secureToken");
  });

  it("strips the trailing Better-Auth signature segment (only the token before the first '.' is hashed/looked up)", () => {
    const cookieHeader = "better-auth.session_token=raw-token-value.some-signature-with.dots-in-it";
    expect(extractSessionToken(cookieHeader)).toBe("raw-token-value");
  });

  it("URL-decodes the cookie value before splitting off the signature", () => {
    // '.' encoded as %2E is unusual but the real cookie value can contain
    // other percent-encoded characters (Better Auth signs+encodes it) —
    // confirm decoding still happens via the delegated implementation.
    const cookieHeader = "better-auth.session_token=tok%2Bplus.sig";
    expect(extractSessionToken(cookieHeader)).toBe("tok+plus");
  });

  it("returns null when the cookie header is null", () => {
    expect(extractSessionToken(null)).toBeNull();
  });

  it("returns null when no session cookie (prefixed or not) is present", () => {
    expect(extractSessionToken("some_other_cookie=value; another=thing")).toBeNull();
  });

  it("returns null for an empty cookie header string", () => {
    expect(extractSessionToken("")).toBeNull();
  });
});
