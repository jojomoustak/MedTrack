/**
 * Bridges Better Auth's core `user.emailVerified` (boolean) field onto
 * this schema's `account.email_verified_at` (nullable timestamp) — the
 * Phase 2 convention: every "when did X happen" fact is a timestamp, not
 * a flag, so it doubles as its own audit trail. ADR-003's
 * `account_credential`/`account_session` design follows the same
 * convention; `email_verified_at` predates ADR-003 (Phase 2 §2.1) and
 * this plugin is what makes Better Auth cooperate with it instead of
 * requiring a schema deviation.
 *
 * Implemented as a minimal Better Auth schema-overriding plugin, not an
 * adapter-level wrapper (contrast `lib/auth/adr003-adapter.ts`'s
 * `session.token` handling) — a plugin can *replace* a core field's
 * `DBFieldAttribute` entirely (see `@better-auth/core`'s own plugin.ts
 * doc example, which shows exactly this pattern for `emailVerified`),
 * which matters here because the adapter-wrapper approach was tried
 * first and empirically fails:
 * `@better-auth/core/db/adapter/utils.ts`'s `withApplyDefault` re-applies
 * a required field's `defaultValue` (`false`) on `create` whenever the
 * incoming value is `null`, and re-applies it again when the key is
 * omitted (`value === undefined`) — so any attempt to smuggle a `null`/
 * omitted value through an adapter wrapper on the create path is
 * silently overwritten back to `false` before it reaches the database,
 * confirmed by running an actual sign-up against a live Postgres
 * instance and observing `false` land in a `timestamptz` column (a hard
 * Postgres type error, not a subtle bug). A plugin-supplied field
 * definition with no `defaultValue` sidesteps that logic entirely, since
 * defaulting only fires when `field.defaultValue !== undefined`.
 *
 * `transform.input`/`transform.output` on a plugin-supplied field DO run
 * (confirmed by reading `@better-auth/core`'s `transformInput`/
 * `transformOutput`) — that's the actual conversion mechanism below. This
 * does NOT extend to `where`-clause values (same limitation as the
 * `session.token` case), but nothing ever queries by `emailVerified`
 * value, so that gap doesn't matter here.
 */
import type { BetterAuthPlugin } from "better-auth";

/**
 * Known cosmetic limitation (verified live, low severity): because this
 * field's declared `type` must match the real underlying column
 * (`date`) for the create/update paths to serialize correctly, some
 * Better Auth response shapes (e.g. `getSession().user.emailVerified`)
 * can surface the value as a `Date` (epoch, i.e. "falsy") rather than a
 * clean `boolean` — the type-coercion step and `transform.output` both
 * run, and the type coercion wins for that specific response path.
 * `account.email_verified_at` itself is always correct (verified via
 * direct SQL: `NULL` until verified, a real timestamp after). Treat that
 * column as authoritative; don't branch UI logic on
 * `session.user.emailVerified`'s exact JS type without re-checking this
 * against whatever Better Auth version is in use.
 */
export const emailVerifiedTimestampPlugin: BetterAuthPlugin = {
  id: "adr003-email-verified-timestamp",
  schema: {
    user: {
      fields: {
        emailVerified: {
          type: "date",
          required: false,
          fieldName: "emailVerifiedAt",
          transform: {
            input: (value) => (value ? new Date() : null),
            output: (value) => Boolean(value),
          },
        },
      },
    },
  },
};
