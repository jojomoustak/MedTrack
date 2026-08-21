/**
 * Runs pending migrations (`lib/db/migrations/*.sql`) against the DIRECT
 * (non-pooled) Neon connection string, per ADR-002. Intended to be run
 * from CI/release tooling (`pnpm db:migrate`), never from request-time
 * application code.
 *
 * Deliberately uses `pg` (node-postgres) rather than
 * `@neondatabase/serverless` here: Neon's HTTP driver only speaks Neon's
 * own HTTP proxy protocol (it cannot reach a plain Postgres server), so it
 * can't be used to test migrations against a local/throwaway Postgres —
 * only against a live Neon endpoint. The direct connection string is,
 * deliberately, a completely standard `postgres://` URL (ADR-002), so a
 * plain TCP client is both simpler and more portable for this one-shot,
 * non-serverless CLI use case. This does not affect the app-runtime
 * driver choice (`lib/db/client.ts` still uses the Neon HTTP driver for
 * pooled request-time traffic).
 */
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

try {
  process.loadEnvFile(".env.local");
} catch {
  try {
    process.loadEnvFile(".env");
  } catch {
    // rely on real process.env (CI/production)
  }
}

async function main() {
  const directUrl = process.env.DATABASE_URL_DIRECT;
  if (!directUrl) {
    throw new Error("DATABASE_URL_DIRECT is required to run migrations (see .env.example).");
  }

  const client = new Client({ connectionString: directUrl });
  await client.connect();
  const db = drizzle(client);

  try {
    console.log("Running migrations against the direct (non-pooled) connection...");
    await migrate(db, { migrationsFolder: "./lib/db/migrations" });
    console.log("Migrations complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exitCode = 1;
});
