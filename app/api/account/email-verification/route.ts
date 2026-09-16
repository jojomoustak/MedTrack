/**
 * GET /api/account/email-verification — whether the CALLER's OWN account
 * (re-derived from the session, CLAUDE.md rule 7 — never a client-supplied
 * id) has confirmed its email address yet (ADR-003 §5's grace-period
 * policy: nothing else in the app gates on this, but password-reset does
 * — see `lib/auth/config.ts`'s `sendResetPassword`). Backs the
 * "unverified email" banner / resend-verification affordance
 * (`components/profile/EmailVerificationBanner.tsx`).
 *
 * Reads `account.email_verified` (the native boolean Better Auth itself
 * reads/writes directly, 2026-09-17 fix — see `lib/db/schema.ts`'s doc
 * comment) rather than deriving from `email_verified_at`. Both are kept
 * in sync (`lib/auth/config.ts`'s `databaseHooks.user.update.after`), but
 * the boolean is the primary source as of this fix, not a derived one.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { toSafeErrorResponse } from "@/lib/errors/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await requireSessionFromRequest(request);
    const db = getDb();
    const [row] = await db
      .select({ emailVerified: schema.account.emailVerified })
      .from(schema.account)
      .where(eq(schema.account.id, session.accountId))
      .limit(1);
    return NextResponse.json({ emailVerified: row?.emailVerified ?? false });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "account.email-verification" });
  }
}
