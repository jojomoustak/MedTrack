/**
 * Session-validation helper — the concrete mechanism behind Phase 1 §9's
 * security boundary ("Authenticated server session → re-derived
 * user/profile → server-side ownership check → database operation") and
 * ADR-003's literal session-validation query:
 *
 *   SELECT s.account_id, s.expires_at
 *   FROM account_session s
 *   JOIN account a ON a.id = s.account_id
 *   WHERE s.token_hash = $1
 *     AND s.revoked_at IS NULL
 *     AND s.expires_at > now()
 *     AND a.status = 'active'
 *
 * The `a.status = 'active'` join is not optional — the ADR-003 security
 * review found and fixed a real gap where a suspended or hard-deleted
 * account's still-unexpired, unrevoked session token could otherwise keep
 * authenticating. Do not "simplify" this back to a session-only check.
 *
 * A hit re-derives `account_id` -> `profile_id` (Phase 2 §2.2,
 * `profile.owner_account_id`) so callers have everything needed to call
 * `withProfileScope()` (lib/db/rls.ts) — this module intentionally goes
 * no further than identity; the application-layer ownership check for a
 * specific resource is the caller's responsibility (CLAUDE.md rule 7).
 *
 * Deliberately queries directly via Drizzle rather than through Better
 * Auth's own `auth.api.getSession()` — this is the lean, dependency-free
 * path ADR-003 specifies for "every request", independent of whatever
 * Better Auth internally does for its own session-management endpoints
 * (sign-in/out/refresh, which still go through the catch-all route
 * handler and Better Auth's own logic).
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { hashSessionToken } from "@/lib/auth/adr003-adapter";
import { AuthenticationError } from "@/lib/errors/app-error";

export interface SessionContext {
  accountId: string;
  profileId: string;
  /** Server-set RLS setting requires a string; kept alongside for convenience/logging (pseudonymized before logging — see lib/logging). */
  sessionExpiresAt: Date;
}

const SESSION_COOKIE_NAME = "better-auth.session_token";

/**
 * Extracts the raw session token from a `Cookie` request header. Better
 * Auth appends `.<signature>` to the cookie value; only the token portion
 * before the first `.` is ever hashed/looked up (matches Better Auth's
 * own cookie format).
 */
export function extractSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`).exec(cookieHeader);
  if (!match) return null;
  const raw = decodeURIComponent(match[1]);
  return raw.split(".")[0] || null;
}

/**
 * Validates a raw session token and, on success, re-derives the owning
 * profile. Returns `null` (never throws) on any invalid/expired/revoked/
 * inactive-account session — callers that require an authenticated
 * session should throw `AuthenticationError` themselves (see
 * `requireSessionContext`) so the "no session" case gets a consistent,
 * safe HTTP response via `lib/errors/http.ts`.
 */
export async function validateSessionToken(rawToken: string): Promise<SessionContext | null> {
  if (!rawToken) return null;
  const db = getDb();
  const tokenHash = hashSessionToken(rawToken);

  const rows = await db
    .select({
      accountId: schema.accountSession.accountId,
      expiresAt: schema.accountSession.expiresAt,
    })
    .from(schema.accountSession)
    .innerJoin(schema.account, eq(schema.account.id, schema.accountSession.accountId))
    .where(
      and(
        eq(schema.accountSession.tokenHash, tokenHash),
        isNull(schema.accountSession.revokedAt),
        gt(schema.accountSession.expiresAt, new Date().toISOString()),
        eq(schema.account.status, "active"),
      ),
    )
    .limit(1);

  const hit = rows[0];
  if (!hit) return null;

  const [profileRow] = await db
    .select({ profileId: schema.profile.id })
    .from(schema.profile)
    .where(eq(schema.profile.ownerAccountId, hit.accountId))
    .limit(1);

  // A session can only exist for an account that has a profile (Phase 2
  // §0: 1:1 at MVP) — if this is ever false, something upstream broke an
  // invariant; fail closed rather than return a partial identity.
  if (!profileRow) return null;

  return {
    accountId: hit.accountId,
    profileId: profileRow.profileId,
    sessionExpiresAt: new Date(hit.expiresAt),
  };
}

/** Same as `validateSessionToken`, but throws a safe `AuthenticationError` instead of returning `null`. */
export async function requireSessionContext(rawToken: string | null): Promise<SessionContext> {
  const context = rawToken ? await validateSessionToken(rawToken) : null;
  if (!context) {
    throw new AuthenticationError();
  }
  return context;
}

/** Convenience wrapper for Next.js route handlers: reads the cookie header from a `Request` directly. */
export async function requireSessionFromRequest(request: Request): Promise<SessionContext> {
  const token = extractSessionToken(request.headers.get("cookie"));
  return requireSessionContext(token);
}
