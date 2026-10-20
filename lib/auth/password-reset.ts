import { eq, sql } from "drizzle-orm";
import type { Db, TestableDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { clearLockout } from "@/lib/auth/lockout";

/**
 * After a password reset succeeds (`lib/auth/config.ts`'s
 * `onPasswordReset`): the lockout is cleared (ADR-003 §"Security review
 * resolution" item 1's escape hatch) and the email counts as confirmed —
 * the reset link reached that inbox and was used, the same proof the
 * verification link gives (2026-10-20). Only ever sets the confirmation,
 * keeping an earlier `email_verified_at`, like `config.ts`'s user-update
 * hook.
 */
export async function completePasswordReset(db: Db | TestableDb, accountId: string): Promise<void> {
  await clearLockout(db, accountId);
  await db
    .update(schema.account)
    .set({ emailVerified: true, emailVerifiedAt: sql`COALESCE(${schema.account.emailVerifiedAt}, now())` })
    .where(eq(schema.account.id, accountId));
}
