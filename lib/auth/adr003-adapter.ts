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

/** Operators that make sense against a stored hash: exact (in)equality only. */
const TOKEN_OPERATORS = new Set(["eq", "ne", "in", "not_in"]);

function hashTokenValue(value: unknown): unknown {
  if (typeof value === "string") return hashSessionToken(value);
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? hashSessionToken(v) : v));
  return value;
}

function convertWhere(model: string, where: Where[] | undefined): Where[] | undefined {
  if (!where || model !== SESSION_MODEL) return where;
  return where.map((clause) => {
    if (clause.field !== TOKEN_FIELD) return clause;
    // `contains`, `starts_with`, `lt`, … can't be expressed against a hash —
    // fail loudly rather than run a query that silently means something else.
    if (clause.operator !== undefined && !TOKEN_OPERATORS.has(clause.operator)) {
      throw new Error(`Unsupported operator "${clause.operator}" on session token`);
    }
    return { ...clause, value: hashTokenValue(clause.value) as Where["value"] };
  });
}

/** A `token` inside write data (create/update) — stored hashed, never raw. */
function hashTokenInData<D>(model: string, data: D): D {
  if (model !== SESSION_MODEL || !data || typeof data !== "object" || typeof (data as Record<string, unknown>)[TOKEN_FIELD] !== "string") return data;
  return { ...(data as Record<string, unknown>), [TOKEN_FIELD]: hashSessionToken((data as Record<string, string>)[TOKEN_FIELD]) } as D;
}

/** Raw token candidates for restoring onto a session result: an `eq` lookup value, and a raw token being written. */
function rawTokensOf(model: string, where: Where[] | undefined, data?: unknown): string[] {
  if (model !== SESSION_MODEL) return [];
  const raws: string[] = [];
  for (const c of where ?? []) {
    if (c.field === TOKEN_FIELD && typeof c.value === "string" && (c.operator === undefined || c.operator === "eq")) raws.push(c.value);
  }
  const written = data && typeof data === "object" ? (data as Record<string, unknown>)[TOKEN_FIELD] : undefined;
  if (typeof written === "string") raws.push(written);
  return raws;
}

/**
 * A session row read back from the database carries the stored HASH in its
 * `token` field. Better Auth treats that field as the raw token — it hands
 * it straight back to `updateSession(token)` during the daily session
 * refresh (where it would be hashed a second time and match nothing) and
 * writes it into the session cookie. When the caller supplied the raw
 * token, put it back — but only onto a row whose stored hash IS that
 * token's hash, so a raw token can never be copied onto another row
 * (whatever shape the `where` had).
 *
 * Real bug (2026-10-08): every session older than `updateAge` (1 day) hit
 * this on its next `get-session` — the refresh "failed", Better Auth
 * deleted the cookie and answered 401, and the user was signed out.
 *
 * Deliberately NOT done the other way round (treating a hash-shaped value
 * in a `where` as already hashed): that would make a stored hash work as a
 * credential, defeating ADR-003's point of storing only hashes.
 */
function withRawToken<R>(result: R, raws: string[]): R {
  if (raws.length === 0 || !result || typeof result !== "object") return result;
  const stored = (result as Record<string, unknown>)[TOKEN_FIELD];
  const raw = raws.find((r) => hashSessionToken(r) === stored);
  return raw ? ({ ...(result as Record<string, unknown>), [TOKEN_FIELD]: raw } as R) : result;
}

type MinimalAdapterSurface = Pick<
  DBAdapter,
  "create" | "findOne" | "findMany" | "update" | "updateMany" | "delete" | "deleteMany" | "count" | "consumeOne" | "incrementOne"
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
    // Better Auth uses the RETURNED object to set the session cookie, so
    // results get the raw token back; the DB row only ever holds the hash.
    create: async (data) =>
      inner
        .create({ ...data, data: hashTokenInData(data.model, data.data) })
        .then((created) => withRawToken(created, rawTokensOf(data.model, undefined, data.data))) as ReturnType<T["create"]>,
    findOne: async (data) =>
      inner
        .findOne({ ...data, where: convertWhere(data.model, data.where) ?? data.where })
        .then((found) => withRawToken(found, rawTokensOf(data.model, data.where))) as ReturnType<T["findOne"]>,
    findMany: async (data) => inner.findMany({ ...data, where: convertWhere(data.model, data.where) }),
    update: async (data) =>
      inner
        .update({ ...data, where: convertWhere(data.model, data.where) ?? data.where, update: hashTokenInData(data.model, data.update) })
        .then((updated) => withRawToken(updated, rawTokensOf(data.model, data.where, data.update))) as ReturnType<T["update"]>,
    updateMany: async (data) => inner.updateMany({ ...data, where: convertWhere(data.model, data.where) ?? data.where, update: hashTokenInData(data.model, data.update) }),
    delete: async (data) => inner.delete({ ...data, where: convertWhere(data.model, data.where) ?? data.where }),
    deleteMany: async (data) => inner.deleteMany({ ...data, where: convertWhere(data.model, data.where) ?? data.where }),
    count: async (data) => inner.count({ ...data, where: convertWhere(data.model, data.where) }),
    consumeOne: async (data) => inner.consumeOne({ ...data, where: convertWhere(data.model, data.where) ?? data.where }),
    incrementOne: async (data) =>
      inner.incrementOne({ ...data, where: convertWhere(data.model, data.where) ?? data.where, set: hashTokenInData(data.model, data.set) }),
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
