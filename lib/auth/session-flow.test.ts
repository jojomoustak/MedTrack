import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { hashSessionToken, withHashedSessionTokenAdapter } from "@/lib/auth/adr003-adapter";
import { DISABLED_SESSION_PATHS, stripSessionTokensAfterHook } from "@/lib/auth/session-hardening";
import { extractSessionToken } from "@/lib/auth/session";

/**
 * Better Auth's real HTTP handlers, run through this app's session-token
 * wrapper (ADR-003) and session hardening, against an in-memory database.
 * The adapter's unit tests replay Better Auth's call pattern by hand; this
 * catches a library upgrade that changes the pattern (security review,
 * 2026-10-08 — the adapter's module doc asks for exactly this re-check).
 */
const SECRET = "integration-test-secret-at-least-32-chars";
const BASE = "http://localhost:3000";
const DAY_MS = 86_400_000;

function setup() {
  const db: Record<string, Record<string, unknown>[]> = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    baseURL: BASE,
    secret: SECRET,
    database: withHashedSessionTokenAdapter(memoryAdapter(db)),
    emailAndPassword: { enabled: true },
    session: { expiresIn: 90 * 86_400, updateAge: 86_400 },
    disabledPaths: DISABLED_SESSION_PATHS,
    hooks: { after: stripSessionTokensAfterHook },
  });
  const call = (path: string, init: { method?: string; cookie?: string; body?: unknown } = {}) =>
    auth.handler(
      new Request(`${BASE}/api/auth${path}`, {
        method: init.method ?? "GET",
        headers: {
          "content-type": "application/json",
          origin: BASE,
          ...(init.cookie ? { cookie: init.cookie } : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      }),
    );
  return { db, call };
}

/** `name=value` of the session cookie a response set, or null. */
function sessionCookieOf(response: Response): string | null {
  const set = response.headers.getSetCookie().find((c) => c.includes("session_token=") && !/Max-Age=0/i.test(c));
  return set ? set.split(";")[0] : null;
}

function rawTokenOf(cookie: string): string {
  return decodeURIComponent(cookie.split("=").slice(1).join("=")).split(".")[0];
}

async function signUp(call: ReturnType<typeof setup>["call"]) {
  const response = await call("/sign-up/email", { method: "POST", body: { email: "maria@example.com", password: "correct-horse-battery", name: "Μαρία" } });
  const cookie = sessionCookieOf(response);
  return { response, cookie: cookie!, body: (await response.json()) as Record<string, unknown> };
}

describe("session flow through Better Auth's real handlers", () => {
  it("signs up with only the token's hash stored and no token in the response body", async () => {
    const { db, call } = setup();
    const { response, cookie, body } = await signUp(call);

    expect(response.status).toBe(200);
    expect(cookie).toBeTruthy();
    expect(db.session).toHaveLength(1);
    expect(db.session[0].token).toBe(hashSessionToken(rawTokenOf(cookie)));
    expect(body).not.toHaveProperty("token");
  });

  it("refreshes a day-old session instead of signing the user out, keeping the same token", async () => {
    // Real bug (2026-10-08): this refresh failed and Better Auth deleted the cookie.
    const { db, call } = setup();
    const { cookie } = await signUp(call);
    db.session[0].expiresAt = new Date(Date.now() + 88 * DAY_MS); // last refreshed two days ago

    const response = await call("/get-session", { cookie });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { session: Record<string, unknown>; user: unknown };
    expect(body.user).toBeTruthy();
    expect(body.session).not.toHaveProperty("token");

    const refreshed = sessionCookieOf(response);
    expect(refreshed).toBeTruthy();
    expect(rawTokenOf(refreshed!)).toBe(rawTokenOf(cookie));
    expect(new Date(db.session[0].expiresAt as Date).getTime()).toBeGreaterThan(Date.now() + 89 * DAY_MS);
    expect(db.session[0].token).toBe(hashSessionToken(rawTokenOf(cookie)));
  });

  it("issues cookies the app's own session check accepts", async () => {
    const { call } = setup();
    const { cookie } = await signUp(call);
    expect(extractSessionToken(cookie, SECRET)).toBe(rawTokenOf(cookie));
  });

  it("deletes the session on sign-out", async () => {
    const { db, call } = setup();
    const { cookie } = await signUp(call);
    const response = await call("/sign-out", { method: "POST", cookie, body: {} });
    expect(response.status).toBe(200);
    expect(db.session).toHaveLength(0);
  });

  it("keeps the broken session-management endpoints switched off", async () => {
    const { call } = setup();
    const { cookie } = await signUp(call);
    for (const path of DISABLED_SESSION_PATHS) {
      const response = await call(path, { method: path === "/list-sessions" ? "GET" : "POST", cookie, body: path === "/list-sessions" ? undefined : {} });
      expect(response.status, path).toBe(404);
    }
  });
});
