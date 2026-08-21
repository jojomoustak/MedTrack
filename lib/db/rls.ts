/**
 * The repository-layer RLS helper ADR-002 mandates as a hard, non-optional
 * implementation constraint ("Release-engineer sign-off" §1):
 *
 *   The `SET LOCAL app.current_profile_id` call and every RLS-guarded
 *   query for that request MUST execute inside the same explicit
 *   transaction / same connection checkout — never as two separate
 *   one-shot calls, since each one-shot HTTP call is its own independent
 *   transaction under Neon's pooled HTTP mode.
 *
 * This is implemented via Neon's HTTP driver batch API
 * (`db.batch([...])`), which Drizzle maps directly onto
 * `@neondatabase/serverless`'s `sql.transaction([...])` — the exact atomic
 * mechanism ADR-002's own code sample uses. Every profile-scoped
 * repository function MUST go through `withProfileScope()` rather than
 * calling `set_config`/`SET LOCAL` itself — this is the single reusable
 * enforcement point, not a per-call convention.
 *
 * `profile_id` is ALSO expected as an explicit `WHERE profile_id = $1` in
 * the queries `buildQueries` constructs (defense-in-depth per Phase 2 data
 * model risk R13's closing note) — RLS is the backstop, not a replacement
 * for query-level scoping.
 *
 * Test-only escape hatch (`options.db`): accepts either the real `Db`
 * (Neon HTTP driver, used in production — has `.batch()`) or a
 * `TestableDb` (a `pg`/node-postgres-backed Drizzle instance, which can
 * reach a local/throwaway Postgres that Neon's HTTP proxy protocol
 * can't — same reasoning as Phase 4's migration runner). A `TestableDb`
 * has no `.batch()`, so the same-batch guarantee is instead provided by a
 * REAL interactive transaction (`db.transaction(...)`) — equally correct,
 * just a different mechanism, and never used outside tests since
 * `getDb()` (the production default) always returns the Neon `Db`.
 */
import { sql } from "drizzle-orm";
import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import { getDb, type Db, type TestableDb } from "@/lib/db/client";

const RLS_PROFILE_SETTING = "app.current_profile_id";
const RLS_ACCOUNT_SETTING = "app.current_account_id";

type AnyDb = Db | TestableDb;

function hasBatch(db: AnyDb): db is Db {
  return typeof (db as Partial<Db>).batch === "function";
}

async function runGuarded<T extends readonly unknown[]>(
  db: AnyDb,
  settings: readonly { key: string; value: string }[],
  buildQueries: (db: Db) => T,
): Promise<T> {
  if (hasBatch(db)) {
    const setCalls = settings.map((s) => db.execute(sql`select set_config(${s.key}, ${s.value}, true)`));
    const guardedQueries = buildQueries(db);
    const batchResult = await db.batch(
      [...setCalls, ...guardedQueries] as unknown as readonly [BatchItem<"pg">, ...BatchItem<"pg">[]],
    );
    return batchResult.slice(setCalls.length) as unknown as T;
  }

  // Test-only fallback: a real interactive transaction over node-postgres.
  return db.transaction(async (tx) => {
    for (const s of settings) {
      await tx.execute(sql`select set_config(${s.key}, ${s.value}, true)`);
    }
    const guardedQueries = buildQueries(tx as unknown as Db);
    const results: unknown[] = [];
    for (const query of guardedQueries) {
      results.push(await query);
    }
    return results as unknown as T;
  });
}

/**
 * Runs `buildQueries` with `app.current_profile_id` (and, for the small
 * set of account-scoped-not-profile-scoped tables like `user_preferences`,
 * `app.current_account_id`) set for the duration of one atomic batch.
 *
 * `buildQueries` must return an array of Drizzle query builders / raw
 * `db.execute(sql\`...\`)` calls built from the `db` handle it's given —
 * it must NOT execute anything against a `db` obtained any other way
 * (e.g. via a top-level `getDb()` call outside this helper), or the
 * same-batch guarantee is broken.
 */
export async function withProfileScope<T extends readonly [BatchItem<"pg">, ...BatchItem<"pg">[]]>(
  profileId: string,
  buildQueries: (db: Db) => T,
  options?: { accountId?: string; db?: AnyDb },
): Promise<BatchResponse<T>> {
  if (!profileId) {
    throw new Error("withProfileScope requires a non-empty profileId.");
  }

  const db = options?.db ?? getDb();
  const settings = [
    { key: RLS_PROFILE_SETTING, value: profileId },
    ...(options?.accountId ? [{ key: RLS_ACCOUNT_SETTING, value: options.accountId }] : []),
  ];

  const results = await runGuarded(db, settings, buildQueries);
  return results as unknown as BatchResponse<T>;
}

/**
 * Variant for the one account-scoped (not profile-scoped) table,
 * `user_preferences` (Phase 2 §2.3 hangs off `Account`, not `Profile`).
 * Still routed through the same same-batch discipline as
 * `withProfileScope`, just keyed on `app.current_account_id` alone.
 */
export async function withAccountScope<T extends readonly [BatchItem<"pg">, ...BatchItem<"pg">[]]>(
  accountId: string,
  buildQueries: (db: Db) => T,
  options?: { db?: AnyDb },
): Promise<BatchResponse<T>> {
  if (!accountId) {
    throw new Error("withAccountScope requires a non-empty accountId.");
  }
  const db = options?.db ?? getDb();
  const results = await runGuarded(db, [{ key: RLS_ACCOUNT_SETTING, value: accountId }], buildQueries);
  return results as unknown as BatchResponse<T>;
}
