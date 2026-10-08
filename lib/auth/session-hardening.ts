import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { stripSessionTokens } from "@/lib/auth/strip-session-tokens";

/**
 * Better Auth session endpoints switched off (security review,
 * 2026-10-08). They answered `{status: true}` while doing nothing —
 * session rows read back through the ADR-003 adapter carry hashed tokens,
 * which these routes then hash again — so "sign out other devices" would
 * have falsely reported success. No UI uses them; an app-owned endpoint
 * keyed by session id belongs here if session management is ever needed.
 * (`/revoke-sessions` deletes by user id and works, so it stays.)
 */
export const DISABLED_SESSION_PATHS = ["/list-sessions", "/revoke-session", "/revoke-other-sessions", "/update-session"];

/**
 * The raw session token belongs only in the signed HttpOnly cookie — this
 * after-hook strips it from every JSON body Better Auth would echo it in
 * (`stripSessionTokens`). Only the body is replaced; the Set-Cookie
 * headers already on the response are kept (Better Auth merges response
 * headers separately from the returned body).
 */
export const stripSessionTokensAfterHook = createAuthMiddleware(async (ctx) => {
  const returned = ctx.context.returned;
  if (!returned || typeof returned !== "object" || returned instanceof Response || isAPIError(returned)) return;
  const stripped = stripSessionTokens(returned);
  if (stripped !== returned) return ctx.json(stripped);
});
