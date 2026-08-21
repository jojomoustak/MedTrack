/**
 * Password-credential lockout (ADR-003 §"Security review resolution" item
 * 1: "per-account, 10 consecutive failed attempts -> 15-minute lock",
 * "progressive friction... from the 5th consecutive failure, add a small
 * server-side delay (1-2s)"), wired into the ADR-003-addendum work (Google
 * Sign-In, A.6) because A.6 made a hard, tested requirement out of
 * something the original ADR only sketched: **every read or write of
 * `failed_login_count`/`locked_until` MUST filter explicitly on
 * `credential_type = 'password'`**, never "the account's credential row"
 * looked up by `account_id` alone — with a `google` row now possible on
 * the same account, that lookup is ambiguous, and a bug that resolves it
 * to the wrong row is a real lockout-bypass or false-lockout risk.
 *
 * This was never actually wired into the sign-in path before this task
 * (`lib/auth/config.ts`'s original doc comment explicitly deferred it to
 * "a Phase 5/6 follow-up" pending lockout UX design) — the addendum's
 * mandatory dual-credential-isolation test needs real enforcement to
 * assert against, so the minimal, already-fully-specified-by-ADR-003
 * mechanics (thresholds, not messaging) are implemented here. What is
 * NOT built here, unchanged from before: distinct lockout-vs-wrong-password
 * UI messaging (still needs `ux-accessibility-designer`), the
 * password-reset escape hatch (no reset flow exists yet), and the
 * separate per-IP rate limit ADR-003 also calls for (an API-layer
 * concern, orthogonal to this per-credential-row scoping fix).
 *
 * Integration point: wraps `emailAndPassword.password.verify` in
 * `lib/auth/config.ts` rather than a generic Better Auth `hooks.before`/
 * `after` matcher. Better Auth's `/sign-in/email` handler calls
 * `password.verify({ hash, password })` with only the stored hash and the
 * submitted plaintext — no account/credential id — but that hash is
 * exactly the value this function just read from the one
 * `account_credential` row it came from (Argon2id's random 128-bit salt
 * makes a cross-account hash collision astronomically unlikely), so
 * looking the row back up by `password_hash` is a safe, self-contained
 * way to get lockout bookkeeping into the one place success/failure is
 * actually decided, without depending on less-documented internal Better
 * Auth request-context fields.
 */
import { and, eq } from "drizzle-orm";
import type { Db, TestableDb } from "@/lib/db/client";
import { accountCredential } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/argon2";

export const LOCKOUT_THRESHOLD = 10;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
export const PROGRESSIVE_DELAY_FROM_ATTEMPT = 5;
export const PROGRESSIVE_DELAY_MS = 1500;

type LockoutDb = Db | TestableDb;

/**
 * Drop-in replacement for a bare `verifyPassword` call inside Better
 * Auth's `emailAndPassword.password.verify` hook. `verifyFn` is injectable
 * for tests (avoids paying Argon2id's real cost / lets a test force a
 * true/false result deterministically); defaults to the real
 * `verifyPassword`.
 */
export async function verifyPasswordWithLockout(
  db: LockoutDb,
  params: { hash: string; password: string },
  verifyFn: (plaintext: string, encoded: string) => Promise<boolean> = verifyPassword,
): Promise<boolean> {
  const [row] = await db
    .select({
      id: accountCredential.id,
      failedLoginCount: accountCredential.failedLoginCount,
      lockedUntil: accountCredential.lockedUntil,
    })
    .from(accountCredential)
    .where(and(eq(accountCredential.credentialType, "password"), eq(accountCredential.passwordHash, params.hash)))
    .limit(1);

  // No matching password-credential row for this exact hash — shouldn't
  // happen (Better Auth read this hash from this table moments earlier),
  // but fail open to a plain verify rather than crashing sign-in over a
  // bookkeeping mismatch.
  if (!row) {
    return verifyFn(params.password, params.hash);
  }

  if (row.lockedUntil && new Date(row.lockedUntil).getTime() > Date.now()) {
    return false;
  }

  if (row.failedLoginCount >= PROGRESSIVE_DELAY_FROM_ATTEMPT) {
    await new Promise((resolve) => setTimeout(resolve, PROGRESSIVE_DELAY_MS));
  }

  const ok = await verifyFn(params.password, params.hash);

  if (ok) {
    await db
      .update(accountCredential)
      .set({ failedLoginCount: 0, lockedUntil: null })
      .where(and(eq(accountCredential.id, row.id), eq(accountCredential.credentialType, "password")));
    return true;
  }

  const nextCount = row.failedLoginCount + 1;
  await db
    .update(accountCredential)
    .set({
      failedLoginCount: nextCount,
      lockedUntil: nextCount >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString() : row.lockedUntil,
    })
    .where(and(eq(accountCredential.id, row.id), eq(accountCredential.credentialType, "password")));
  return false;
}
