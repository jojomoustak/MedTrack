/**
 * Validated environment/config module.
 *
 * Every server-side module that needs configuration (database connections,
 * auth secrets, etc.) must go through `getEnv()` rather than reading
 * `process.env` directly. This guarantees:
 *   - missing/malformed values fail fast with a clear, typed error instead
 *     of silently propagating `undefined` into a connection string or a
 *     crypto secret;
 *   - the shape of required configuration is documented in exactly one
 *     place (this file + `.env.example`), not scattered across call sites.
 *
 * Validation is lazy (first call to `getEnv()`), not import-time-eager, so
 * that `next build`'s static analysis of route modules doesn't require a
 * live DATABASE_URL to be present just because a module imports this file.
 * Any code path that actually needs config MUST call `getEnv()` before
 * using it — never read `process.env.FOO` directly outside this file.
 */
import { z } from "zod";
import { ConfigError } from "@/lib/errors/app-error";

const nonEmpty = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} must not be empty`);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Neon Postgres — pooled connection (PgBouncer transaction-pooling mode),
  // used for all application/request-time queries (ADR-002).
  DATABASE_URL: nonEmpty("DATABASE_URL").refine(
    (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
    "DATABASE_URL must be a postgres:// connection string",
  ),

  // Neon Postgres — direct (non-pooled) connection, used only by migration
  // tooling and admin/one-off scripts (ADR-002 "Release-engineer sign-off").
  DATABASE_URL_DIRECT: nonEmpty("DATABASE_URL_DIRECT").refine(
    (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
    "DATABASE_URL_DIRECT must be a postgres:// connection string",
  ),

  // Better Auth (ADR-003).
  BETTER_AUTH_SECRET: nonEmpty("BETTER_AUTH_SECRET").refine(
    (v) => v.length >= 32,
    "BETTER_AUTH_SECRET must be at least 32 characters (high-entropy secret)",
  ),
  BETTER_AUTH_URL: nonEmpty("BETTER_AUTH_URL").refine(
    (v) => {
      try {
        new URL(v);
        return true;
      } catch {
        return false;
      }
    },
    "BETTER_AUTH_URL must be a valid absolute URL",
  ),
  // Comma-separated list of trusted origins for CSRF/origin checks
  // (ADR-003 §"CSRF posture" — must be locked to production domain(s)).
  BETTER_AUTH_TRUSTED_ORIGINS: nonEmpty("BETTER_AUTH_TRUSTED_ORIGINS"),

  // HMAC pepper used to derive account_session.ip_hash = HMAC-SHA256(ip, pepper).
  // Never a bare/unsalted hash — see ADR-003 "Additional findings".
  IP_HASH_PEPPER: nonEmpty("IP_HASH_PEPPER").refine(
    (v) => v.length >= 32,
    "IP_HASH_PEPPER must be at least 32 characters",
  ),

  // Google Sign-In (ADR-003 addendum, 2026-08-21, A.9). From Google Cloud
  // Console -> APIs & Services -> Credentials -> OAuth 2.0 Client ID (Web
  // application type) — see the addendum's A.8 setup checklist.
  GOOGLE_CLIENT_ID: nonEmpty("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: nonEmpty("GOOGLE_CLIENT_SECRET"),

  // HMAC pepper for `deleted_profile_registry`/`account_deletion_audit`'s
  // `account_id_hash` (CLAUDE.md rule 9 hard-delete workflow, Phase 2 §4)
  // = HMAC-SHA256(accountId, pepper) — same non-reversibility discipline as
  // `IP_HASH_PEPPER` (a bare hash of a low-entropy value is brute-forceable;
  // an account id is a random UUID so this is extra caution, not a fix for
  // a demonstrated weakness, but kept consistent with the project's one
  // established pattern rather than inventing a second). A DEDICATED
  // pepper, not IP_HASH_PEPPER reused, to avoid mixing two different HMAC
  // purposes under one key — flagged for `security-privacy-reviewer` to
  // confirm as the right call, not assumed.
  ACCOUNT_ID_HASH_PEPPER: nonEmpty("ACCOUNT_ID_HASH_PEPPER").refine(
    (v) => v.length >= 32,
    "ACCOUNT_ID_HASH_PEPPER must be at least 32 characters",
  ),

  // Vercel Blob (user-uploaded medication photos, `lib/medications/server/photo.ts`).
  // Deliberately OPTIONAL, unlike every other secret above: there is no
  // meaningful local-only fallback for blob storage (see .env.example),
  // and this app must still build/run/typecheck/test for everyone who
  // hasn't set up Blob storage on their Vercel project yet — the photo
  // feature itself fails closed with a clear `ConfigError` (never a
  // silent no-op) the moment it's actually exercised without this set,
  // rather than making the ENTIRE app (including unrelated routes that
  // happen to call `getEnv()`) refuse to start.
  BLOB_READ_WRITE_TOKEN: z.string().trim().min(1).optional(),

  // Alternative to BLOB_READ_WRITE_TOKEN (stabilization task, 2026-08-29):
  // `@vercel/blob@2.8.0` also authenticates via Vercel's OIDC federation —
  // a short-lived token Vercel injects into every deployed function's
  // runtime automatically, combined with which store to use. `getEnv()`
  // only needs to know the store id; the SDK reads the OIDC token itself
  // from `process.env.VERCEL_OIDC_TOKEN` (not re-declared here — it's
  // platform-injected, never something this app's own config should
  // require or validate the shape of).
  BLOB_STORE_ID: z.string().trim().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Parses and validates process.env on first call, caches the result.
 * Throws a `ConfigError` (safe, descriptive, never leaks secret values)
 * if anything required is missing or malformed.
 */
export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new ConfigError(
      `Invalid or missing environment configuration:\n${issues}\n` +
        "See .env.example for the full list of required variables.",
    );
  }

  cached = parsed.data;
  return cached;
}

/** Test-only: clears the cached, validated env so a test can re-validate. */
export function __resetEnvCacheForTests(): void {
  cached = undefined;
}
