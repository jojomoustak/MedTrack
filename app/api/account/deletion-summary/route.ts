/**
 * GET /api/account/deletion-summary — real counts for the Delete Account
 * confirmation screen (Phase 3 §2.9 step 3). Re-derives `profileId` from
 * the session (CLAUDE.md rule 7) — never accepts one from the client.
 */
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { getDeletionSummary } from "@/lib/account/server/deletion-summary";
import { toSafeErrorResponse } from "@/lib/errors/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await requireSessionFromRequest(request);
    const summary = await getDeletionSummary(session.profileId);
    return NextResponse.json(summary);
  } catch (err) {
    return toSafeErrorResponse(err, { route: "account.deletion-summary" });
  }
}
