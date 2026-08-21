/**
 * ADR-003 addendum (2026-08-21, "Sign in with Google") A.3: never persist
 * OAuth tokens. MedTracking needs Google identity, never ongoing API
 * access — the `oauth_*` columns on `account_credential` exist only
 * because Better Auth's Drizzle adapter needs a write target for its
 * `account` model's token fields (`lib/db/schema.ts`'s `accountCredential`
 * table comment), never because this app reads them back.
 *
 * Wired into BOTH `databaseHooks.account.create.before` AND
 * `account.update.before` in `lib/auth/config.ts` — a security-review
 * correction (item 2 of "Security review resolution (addendum)"): the
 * `create` hook alone only covers a user's FIRST Google sign-in. Every
 * *repeat* sign-in to an already-linked account goes through Better
 * Auth's `account.update` instead (confirmed against the pinned version,
 * `node_modules/better-auth/dist/api/routes/callback.mjs`'s `link`
 * branch calls `internalAdapter.updateAccount` to refresh the linked
 * row's token fields in place) — the common case for every returning
 * user, not a rare edge case.
 *
 * Extracted into its own module (rather than an unexported helper inside
 * `config.ts`) so the stripping logic itself is directly unit-testable
 * without needing a live Better Auth/OAuth round trip — see
 * `oauth-token-strip.test.ts`.
 */

/**
 * Better Auth's own `databaseHooks.account.create.before`/`update.before`
 * payload is typed loosely by the library itself (`Record<string, any>`
 * internally, per `better-auth/dist/db/with-hooks`) — accepted here as
 * `Record<string, unknown>` rather than widening to `any` (CLAUDE.md rule
 * "never use `any`"), and returned as-is except for the six OAuth
 * token/scope/expiry fields, forced to `null` regardless of what Better
 * Auth's OAuth flow tried to write.
 */
export function stripOAuthTokens(account: Record<string, unknown>): Record<string, unknown> {
  return {
    ...account,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    scope: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
  };
}
