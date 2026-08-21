/**
 * ADR-003 addendum A.5: the OAuth callback flow is a full-page redirect
 * (Google's consent screen, then back through
 * `/api/auth/callback/google`), so a rejected sign-in never reaches this
 * app as a `fetch()` response the way `signIn.email`'s errors do — Better
 * Auth instead redirects the browser back to `errorCallbackURL` (passed
 * at `signIn.social()` call time) with `?error=<code>` appended
 * (`node_modules/better-auth/dist/oauth2/errors.mjs`'s `redirectOnError`).
 * `/login` and `/register` both read this query param on mount and map it
 * through here — never showing Better Auth's raw error code/message
 * (CLAUDE.md rule 8) and never a generic failure for the one case the
 * addendum requires a specific message for.
 *
 * Verified against the actually-pinned Better Auth version (1.7.1, satisfies
 * the ADR's `>=1.6.11` floor): the unauthenticated-visitor-email-collision
 * case returns `{ error: "account not linked" }` from
 * `oauth2/link-account.mjs`, which the `/callback/:id` route turns into
 * `?error=account_not_linked` (spaces -> underscores). `unable_to_link_account`
 * is a distinct code for a related but different case (the *explicit*,
 * already-authenticated `linkSocial()` path failing after the fact) — both
 * are mapped to the same addendum-mandated message since both represent
 * "this Google identity can't be silently attached here."
 */
const ACCOUNT_COLLISION_MESSAGE =
  "Υπάρχει ήδη λογαριασμός με αυτό το email. Συνδεθείτε με τον κωδικό πρόσβασής σας και, στη συνέχεια, συνδέστε το Google από τις Ρυθμίσεις.";

const GENERIC_GOOGLE_ERROR_MESSAGE = "Η σύνδεση με Google απέτυχε. Δοκιμάστε ξανά.";

const ACCOUNT_COLLISION_CODES = new Set(["account_not_linked", "unable_to_link_account"]);

/** Returns null for "no error param present" (the common case), never for "error present but unmapped." */
export function mapGoogleAuthError(code: string | null): string | null {
  if (!code) return null;
  if (ACCOUNT_COLLISION_CODES.has(code)) return ACCOUNT_COLLISION_MESSAGE;
  return GENERIC_GOOGLE_ERROR_MESSAGE;
}
