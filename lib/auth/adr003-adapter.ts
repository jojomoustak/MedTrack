/**
 * Adapter-level wrapper that makes Better Auth's `session.token` handling
 * match ADR-003's `account_session.token_hash` requirement: the database
 * must only ever hold `HASH(token)`, never the raw session token.
 *
 * Why this can't be done with Better Auth's own `fields` config: that
 * option (`Record<field, columnName>` — confirmed by reading
 * `@better-auth/core`'s `BetterAuthDBOptions` type) only renames a
 * column, it has no value-transform hook. The richer per-field
 * `transform` hook (`DBFieldAttribute.transform`) exists, but only
 * applies on writes — `@better-auth/core`'s `transformWhereClause`
 * (confirmed by reading its source) does NOT run `transform.input` on
 * `where`-clause values. A field-level transform would therefore hash the
 * token on write but search for the raw token on every subsequent lookup
 * (session validation, sign-out, refresh), silently breaking every login.
 * Wrapping the adapter at the `DBAdapter` call boundary — before Better
 * Auth's own transformation runs — is the layer where the same hashing
 * function can be applied uniformly to both paths.
 *
 * (The equivalent problem for `user.emailVerified` — bridging Better
 * Auth's boolean field to this schema's `email_verified_at` timestamp —
 * is solved differently, via a small schema-overriding plugin
 * (`lib/auth/email-verified-plugin.ts`), because that field's value only
 * ever needs a write-side transform, not a where-clause one; see that
 * file's doc comment for why the adapter-wrapper approach doesn't work
 * for it — Better Auth's own default-value injection defeats it.)
 *
 * IMPORTANT (found only by tracing a real sign-up through
 * `@better-auth/core`'s source — not documented anywhere): Better Auth
 * does not always call `create`/`findOne`/etc. on the adapter it was
 * given directly. Mutating routes (sign-up, sign-in) run inside
 * `runWithTransaction(ctx.adapter, fn)`
 * (`@better-auth/core/context/transaction.ts`), which calls
 * `ctx.adapter.transaction(async (trx) => ...)` and stashes `trx` — the
 * adapter's OWN internally-constructed transaction-scoped object, NOT the
 * outer adapter — in `AsyncLocalStorage`. Every subsequent
 * `getCurrentAdapter(fallback)` call (used internally by
 * `createWithHooks`/`updateWithHooks`/etc.) then resolves to that `trx`
 * object instead of the fallback. A wrapper that only overrides the
 * top-level adapter's methods and leaves `transaction` untouched is
 * silently bypassed for every route that opens a transaction — which is
 * most of them. `wrapAdapterSurface` below is applied to BOTH the
 * top-level adapter and to whatever `trx` object the real adapter's own
 * `transaction()` hands back, so there is no path that reaches Postgres
 * without going through the token-hashing conversion.
 *
 * Verified against a real Postgres instance with a live sign-up → sign-in
 * → getSession round trip during development of this module (see Phase 4
 * report); re-run that check after any Better Auth upgrade that touches
 * adapter internals.
 */
import { createHash } from "node:crypto";
import type { DBAdapter, DBTransactionAdapter, Where } from "@better-auth/core/db/adapter";
import type { BetterAuthOptions } from "better-auth";

const SESSION_MODEL = "session";
const TOKEN_FIELD = "token";

export function hashSessionToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function convertWhere(model: string, where: Where[] | undefined): Where[] | undefined {
  if (!where) return where;
  return where.map((clause) =>
    model === SESSION_MODEL && clause.field === TOKEN_FIELD && typeof clause.value === "string"
      ? { ...clause, value: hashSessionToken(clause.value) }
      : clause,
  );
}

type MinimalAdapterSurface = Pick<
  DBAdapter,
  "create" | "findOne" | "findMany" | "update" | "updateMany" | "delete" | "deleteMany" | "count"
>;

/**
 * Applies the session-token hashing conversion to any object implementing
 * the core CRUD surface — used for both the top-level adapter and for the
 * transaction-scoped adapter Better Auth's own `transaction()` hands back
 * (see module doc). Generic over the input type so it works for both
 * `DBAdapter` and `DBTransactionAdapter`.
 */
function wrapAdapterSurface<T extends MinimalAdapterSurface>(inner: T): T {
  return {
    ...inner,
    create: (data) => {
      if (data.model === SESSION_MODEL) {
        const raw = (data.data as Record<string, unknown>)[TOKEN_FIELD];
        if (typeof raw === "string") {
          const hashedData = { ...data.data, [TOKEN_FIELD]: hashSessionToken(raw) };
          return inner.create({ ...data, data: hashedData }).then((created) => ({
            // Better Auth uses the RETURNED object to set the session
            // cookie — restore the raw token here; the DB row itself
            // only ever held the hash.
            ...(created as Record<string, unknown>),
            [TOKEN_FIELD]: raw,
          })) as ReturnType<T["create"]>;
        }
      }
      return inner.create(data);
    },
    findOne: (data) => inner.findOne({ ...data, where: convertWhere(data.model, data.where) ?? data.where }),
    findMany: (data) => inner.findMany({ ...data, where: convertWhere(data.model, data.where) }),
    update: (data) => inner.update({ ...data, where: convertWhere(data.model, data.where) ?? data.where }),
    updateMany: (data) => inner.updateMany({ ...data, where: convertWhere(data.model, data.where) ?? data.where }),
    delete: (data) => inner.delete({ ...data, where: convertWhere(data.model, data.where) ?? data.where }),
    deleteMany: (data) => inner.deleteMany({ ...data, where: convertWhere(data.model, data.where) ?? data.where }),
    count: (data) => inner.count({ ...data, where: convertWhere(data.model, data.where) }),
  };
}

/**
 * Takes a Better Auth adapter factory (e.g. the result of calling
 * `drizzleAdapter(db, config)`) and returns a new factory that hashes
 * `session.token` on every write and lookup — including inside every
 * transaction the adapter opens (see module doc for why that's a separate
 * concern from wrapping the top-level adapter).
 */
export function withHashedSessionTokenAdapter(
  adapterFactory: (options: BetterAuthOptions) => DBAdapter,
): (options: BetterAuthOptions) => DBAdapter {
  return (options: BetterAuthOptions): DBAdapter => {
    const inner = adapterFactory(options);
    const wrappedOuter = wrapAdapterSurface(inner);

    return {
      ...wrappedOuter,
      transaction: (fn) =>
        inner.transaction((trx: DBTransactionAdapter<BetterAuthOptions>) => fn(wrapAdapterSurface(trx))),
    };
  };
}
