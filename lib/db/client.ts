/**
 * Neon Postgres connection (ADR-002). Lazy singletons — nothing here runs
 * at module-import time, only when a caller actually needs a connection,
 * so importing this module (e.g. for its types) never requires
 * DATABASE_URL to be set (keeps `next build`/typecheck independent of live
 * infra).
 *
 * Two distinct connections, matching ADR-002 exactly:
 *   - `getDb()` — the pooled (PgBouncer transaction-mode) connection, for
 *     all request-time application traffic. Uses Neon's HTTP driver
 *     (`@neondatabase/serverless`) in production, which avoids the
 *     connection-exhaustion problem of ephemeral serverless functions
 *     opening raw TCP connections. Profile-scoped queries MUST go through
 *     `lib/db/rls.ts`'s `withProfileScope()` helper, not this export
 *     directly, so `SET LOCAL app.current_profile_id` and the guarded
 *     query are guaranteed to land in the same atomic batch.
 *   - migrations use the DIRECT (non-pooled) connection string via
 *     `lib/db/migrate.ts` / `drizzle.config.ts` — never through this file.
 *
 * Local-dev driver override (bug fix, found by an actual browser
 * click-through against a local Docker Postgres): the Neon HTTP driver
 * can ONLY speak Neon's own proxy protocol — it cannot reach a plain
 * Postgres over raw TCP no matter what `DATABASE_URL` points at, so
 * `pnpm dev` against a local/throwaway Postgres previously failed for
 * every route that touches the database (`NeonDbError: ... fetch
 * failed`), contradicting `.env.example`'s claim that local Postgres
 * works for `pnpm dev`. `getDb()` now supports an explicit, OPT-IN
 * `node-postgres`/`pg`-backed path (the same `TestableDb` driver already
 * used by the test suite's `withProfileScope`/`withAccountScope`
 * fallback, `lib/db/rls.ts`) — gated behind BOTH
 * `NODE_ENV !== "production"` AND `DATABASE_DRIVER=local-pg` being set
 * explicitly, never inferred from the connection string itself, so there
 * is no code path by which this can silently activate in a real
 * deployment.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/lib/config/env";
import * as schema from "@/lib/db/schema";

export type Db = NeonHttpDatabase<typeof schema>;

/**
 * The shape a `pg`/node-postgres-backed Drizzle instance has. Two uses:
 *   1. Test-only injection into `lib/db/rls.ts`'s
 *      `withProfileScope`/`withAccountScope` (a local/throwaway Postgres
 *      in a Docker container, per the same "verify against a real
 *      instance" approach Phase 4 used).
 *   2. `getDb()`'s own opt-in local-dev path below — real, not test-only,
 *      when `DATABASE_DRIVER=local-pg` is explicitly set outside
 *      production.
 */
export type TestableDb = NodePgDatabase<typeof schema>;

const LOCAL_PG_DRIVER_FLAG = "local-pg";

/**
 * Explicit and opt-in by construction: both conditions must hold, and
 * neither is derived from `DATABASE_URL`'s shape — a production
 * deployment (`NODE_ENV=production`) can never take this path regardless
 * of what `DATABASE_DRIVER` is accidentally set to.
 */
function shouldUseLocalPgDriver(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DATABASE_DRIVER === LOCAL_PG_DRIVER_FLAG;
}

let dbSingleton: Db | TestableDb | undefined;

/**
 * The pooled, request-time Drizzle database handle. See module doc for
 * the RLS caveat and the local-dev driver override.
 */
export function getDb(): Db | TestableDb {
  if (dbSingleton) return dbSingleton;
  const env = getEnv();

  if (shouldUseLocalPgDriver()) {
    const pool = new Pool({ connectionString: env.DATABASE_URL });
    dbSingleton = drizzlePg(pool, { schema });
    return dbSingleton;
  }

  const sql = neon(env.DATABASE_URL);
  dbSingleton = drizzle(sql, { schema });
  return dbSingleton;
}

export { schema };
