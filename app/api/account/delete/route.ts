/**
 * POST /api/account/delete — "Delete Account / Delete My Health Data"
 * (CLAUDE.md rule 9, Phase 2 §4 Mechanism B, Phase 3 §2.9). Re-derives
 * `accountId`/`profileId` from the authenticated session exactly like
 * every other protected route (CLAUDE.md rule 7) — never trusts a
 * client-supplied id, and `method` is always `"user_initiated"` here on
 * purpose: this is the self-service endpoint. Any future admin/legal-request
 * deletion path would be a separately-authorized internal tool, not this
 * route accepting a client-chosen method.
 *
 * Deliberately does NOT revoke the session cookie itself — the deletion
 * job already deletes every `account_session` row for this account as
 * part of its one atomic step, which makes the CURRENT session token
 * invalid at the database level immediately. The client is still
 * responsible for calling `authClient.signOut()` after a successful
 * response (Phase 3 §2.9 step 5, "forced sign-out") to clear its own
 * cookie/local session state — the server-side row being gone is what
 * actually matters for security; the client-side cleanup is UX hygiene.
 */
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { deleteAccount } from "@/lib/account/server/delete-account";
import { toSafeErrorResponse } from "@/lib/errors/http";
import { logger } from "@/lib/logging/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requireSessionFromRequest(request);
    const result = await deleteAccount({
      accountId: session.accountId,
      profileId: session.profileId,
      method: "user_initiated",
      actor: "self",
    });

    logger.info("account.delete.requested", { alreadyDeleted: result.alreadyDeleted });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "account.delete" });
  }
}
