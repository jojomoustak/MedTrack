/**
 * Removes raw session tokens from Better Auth JSON response bodies.
 *
 * Security review (2026-10-08): the session token is a bearer credential
 * that belongs only in the signed HttpOnly cookie, but Better Auth also
 * echoes it in bodies — top-level `token` on sign-in / sign-up / change
 * password, and `session.token` on `/get-session`. Once the ADR-003
 * adapter started returning raw tokens on lookups (so the daily session
 * refresh works), `/get-session` would have handed the raw token to any
 * script on the origin, defeating HttpOnly. No client code reads either
 * field; the cookie carries the session.
 *
 * Returns the same object when there was nothing to strip, so callers can
 * tell whether to replace the response.
 */
export function stripSessionTokens<T>(body: T): T {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const record = body as Record<string, unknown>;
  const session = record.session;
  const sessionHasToken = !!session && typeof session === "object" && "token" in (session as Record<string, unknown>);
  if (!("token" in record) && !sessionHasToken) return body;

  const { token: _dropped, ...rest } = record;
  void _dropped;
  if (sessionHasToken) {
    const { token: _sessionToken, ...sessionRest } = session as Record<string, unknown>;
    void _sessionToken;
    rest.session = sessionRest;
  }
  return rest as T;
}
