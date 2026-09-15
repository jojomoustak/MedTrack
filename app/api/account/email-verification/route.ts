/**
 * GET /api/account/email-verification — whether the CALLER's OWN account
 * (re-derived from the session, CLAUDE.md rule 7 — never a client-supplied
 * id) has confirmed its email address yet (ADR-003 §5's grace-period
 * policy: nothing else in the app gates on this, but password-reset does
 * — see `lib/auth/config.ts`'s `sendResetPassword`). Backs the
 * "unverified email" banner / resend-verification affordance
 * (`components/profile/EmailVerificationBanner.tsx`).
 *
 * Reads `account.email_verified_at` directly rather than trusting Better
 * Auth's session-shaped `user.emailVerified` — `lib/auth/email-verified-
 * plugin.ts`'s own doc comment documents that field as unreliable on some
 * client response paths (can surface as a raw `Date` rather than a clean
 * boolean); this column is the authoritative source per that same comment.
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
      .select({ emailVerifiedAt: schema.account.emailVerifiedAt })
      .from(schema.account)
      .where(eq(schema.account.id, session.accountId))
      .limit(1);
    return NextResponse.json({ emailVerified: Boolean(row?.emailVerifiedAt) });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "account.email-verification" });
  }
}
