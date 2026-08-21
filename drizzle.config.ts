import { defineConfig } from "drizzle-kit";

// drizzle-kit itself runs outside the Next.js process, so it doesn't get
// automatic .env loading — load it explicitly here. Safe no-op if the file
// doesn't exist (e.g. in CI where real env vars are injected directly).
try {
  process.loadEnvFile(".env.local");
} catch {
  try {
    process.loadEnvFile(".env");
  } catch {
    // no .env file present — rely on real process.env (CI/production tooling)
  }
}

// Migrations/admin tooling must use the DIRECT (non-pooled) connection
// string per ADR-002 — the pooled string is reserved for request-time
// application traffic that goes through the RLS transaction-batching
// helper (lib/db/rls.ts).
const directUrl = process.env.DATABASE_URL_DIRECT;
if (!directUrl) {
  throw new Error(
    "DATABASE_URL_DIRECT is required to run drizzle-kit (migrations use the direct, non-pooled connection per ADR-002). See .env.example.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dbCredentials: {
    url: directUrl,
  },
  strict: true,
  verbose: true,
});
