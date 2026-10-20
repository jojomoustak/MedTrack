import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { withHashedSessionTokenAdapter } from "@/lib/auth/adr003-adapter";
import { DISABLED_SESSION_PATHS, stripSessionTokensAfterHook } from "@/lib/auth/session-hardening";

/**
 * The email-verification gate (owner's call, 2026-10-20; ADR-003 §5
 * amended) through Better Auth's real HTTP handlers, against an in-memory
 * database. The flags below are the ones `lib/auth/config.ts` sets
 * (`config.test.ts` pins them there); this checks what they actually do in
 * the pinned Better Auth version, end to end.
 */
const SECRET = "integration-test-secret-at-least-32-chars";
const BASE = "http://localhost:3000";
const EMAIL = "maria@example.com";
const PASSWORD = "correct-horse-battery";

function setup() {
  const db: Record<string, Record<string, unknown>[]> = { user: [], session: [], account: [], verification: [] };
  const verificationLinks: string[] = [];
  const existingAccountNotices: string[] = [];
  const resetTokens: string[] = [];
  const auth = betterAuth({
    baseURL: BASE,
    secret: SECRET,
    database: withHashedSessionTokenAdapter(memoryAdapter(db)),
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: true,
      onExistingUserSignUp: async ({ user }) => {
        existingAccountNotices.push(user.email);
      },
      sendResetPassword: async ({ token }) => {
        resetTokens.push(token);
      },
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ url }) => {
        verificationLinks.push(url);
      },
    },
    disabledPaths: DISABLED_SESSION_PATHS,
    hooks: { after: stripSessionTokensAfterHook },
  });
  const request = (url: string, init: { method?: string; body?: unknown; cookie?: string } = {}) =>
    auth.handler(
      new Request(url, {
        method: init.method ?? "GET",
        headers: { "content-type": "application/json", origin: BASE, ...(init.cookie ? { cookie: init.cookie } : {}) },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      }),
    );
  const call = (path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) => request(`${BASE}/api/auth${path}`, init);
  const signUp = (email = EMAIL, password = PASSWORD) =>
    call("/sign-up/email", { method: "POST", body: { email, password, name: "Μαρία", callbackURL: "/email-verified" } });
  const signIn = (password = PASSWORD) => call("/sign-in/email", { method: "POST", body: { email: EMAIL, password } });
  return { db, verificationLinks, existingAccountNotices, resetTokens, request, call, signUp, signIn };
}

const sessionCookieOf = (response: Response) => response.headers.getSetCookie().find((c) => c.includes("session_token=") && !/Max-Age=0/i.test(c)) ?? null;

describe("email verification before the first sign-in", () => {
  it("sign-up sends the link and starts no session", async () => {
    const { db, verificationLinks, signUp } = setup();
    const response = await signUp();

    expect(response.status).toBe(200);
    expect(sessionCookieOf(response)).toBeNull();
    expect(db.session).toHaveLength(0);
    expect(verificationLinks).toHaveLength(1);
    expect(verificationLinks[0]).toContain("/api/auth/verify-email?token=");
    expect(verificationLinks[0]).toContain(`callbackURL=${encodeURIComponent("/email-verified")}`);
  });

  it("sign-in is refused with EMAIL_NOT_VERIFIED until the link is opened, without mailing a new link each time", async () => {
    const { db, verificationLinks, signUp, signIn } = setup();
    await signUp();

    const refused = await signIn();
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { code?: string }).code).toBe("EMAIL_NOT_VERIFIED");
    expect(sessionCookieOf(refused)).toBeNull();
    expect(db.session).toHaveLength(0);
    expect(verificationLinks).toHaveLength(1);
  });

  it("opening the link confirms the email and lands on /email-verified without a session there; the app's sign-in then works", async () => {
    const { db, verificationLinks, request, signUp, signIn } = setup();
    await signUp();

    const opened = await request(verificationLinks[0]);
    expect(opened.status).toBe(302);
    expect(opened.headers.get("location")).toBe("/email-verified");
    expect(sessionCookieOf(opened)).toBeNull();
    expect(db.user[0].emailVerified).toBe(true);
    expect(db.session).toHaveLength(0);

    const signedIn = await signIn();
    expect(signedIn.status).toBe(200);
    expect(sessionCookieOf(signedIn)).toBeTruthy();
  });

  it("a damaged link lands on /email-verified with an error and confirms nothing", async () => {
    const { db, verificationLinks, request, signUp } = setup();
    await signUp();

    const opened = await request(verificationLinks[0].replace("token=", "token=x"));
    expect(opened.status).toBe(302);
    expect(opened.headers.get("location")).toBe("/email-verified?error=INVALID_TOKEN");
    expect(db.user[0].emailVerified).toBe(false);
  });

  it("a sign-up with an email that has an account is answered like a new one, and only the owner is told", async () => {
    const { db, verificationLinks, existingAccountNotices, signUp } = setup();
    const fresh = await signUp();
    const freshBody = (await fresh.json()) as Record<string, unknown>;

    const repeat = await signUp(EMAIL, "another-password-entirely");
    const repeatBody = (await repeat.json()) as Record<string, unknown>;

    expect(repeat.status).toBe(fresh.status);
    expect(Object.keys(repeatBody).sort()).toEqual(Object.keys(freshBody).sort());
    expect(sessionCookieOf(repeat)).toBeNull();
    expect(db.user).toHaveLength(1);
    expect(existingAccountNotices).toEqual([EMAIL]);
    expect(verificationLinks).toHaveLength(1);
  });

  it("the link can be asked for again without a session, with the same answer whether or not the address has an account", async () => {
    const { verificationLinks, call, signUp } = setup();
    await signUp();

    const known = await call("/send-verification-email", { method: "POST", body: { email: EMAIL, callbackURL: "/email-verified" } });
    const unknown = await call("/send-verification-email", { method: "POST", body: { email: "nobody@example.com", callbackURL: "/email-verified" } });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
    expect(verificationLinks).toHaveLength(2);
  });

  it("an account not confirmed yet can still reset its password (the reset link proves the inbox too)", async () => {
    const { resetTokens, call, signUp } = setup();
    await signUp();

    const requested = await call("/request-password-reset", { method: "POST", body: { email: EMAIL, redirectTo: "/reset-password" } });

    expect(requested.status).toBe(200);
    expect(resetTokens).toHaveLength(1);
  });

  // Security review 2026-10-20: someone registers the address first and the owner, puzzled, opens that link.
  it("an address someone else registered first is taken back by a reset, which signs that person out", async () => {
    const { verificationLinks, resetTokens, request, call, signUp, signIn } = setup();
    const SQUATTER_PASSWORD = "squatters-own-password";
    await signUp(EMAIL, SQUATTER_PASSWORD);
    await request(verificationLinks[0]); // opened by the address's real owner

    const squatter = sessionCookieOf(await signIn(SQUATTER_PASSWORD));
    expect(squatter).toBeTruthy();

    await call("/request-password-reset", { method: "POST", body: { email: EMAIL, redirectTo: "/reset-password" } });
    const reset = await call("/reset-password", { method: "POST", body: { token: resetTokens[0], newPassword: PASSWORD } });
    expect(reset.status).toBe(200);

    const squatterSession = await call("/get-session", { cookie: squatter! });
    expect(await squatterSession.json()).toBeNull();
    expect((await signIn(SQUATTER_PASSWORD)).status).toBe(401);
    expect((await signIn(PASSWORD)).status).toBe(200);
  });
});
