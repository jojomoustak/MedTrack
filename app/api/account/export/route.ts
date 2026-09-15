/**
 * GET /api/account/export — GDPR Art. 15/20 (right of access / data
 * portability), flagged as a missing gap by the security-privacy-reviewer
 * audit (Phase 15 Hardening, 2026-09-15): `deleteAccount` already existed
 * with a reviewed, complete table enumeration, but nothing let a user get
 * their own data back out. Re-derives `accountId`/`profileId` from the
 * session (CLAUDE.md rule 7) — never accepts either from the client.
 *
 * Returns the export as a downloadable JSON attachment rather than an
 * inline response — this is a full data dump, not something meant to be
 * rendered in-app.
 */
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { exportAccountData } from "@/lib/account/server/export-account-data";
import { toSafeErrorResponse } from "@/lib/errors/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await requireSessionFromRequest(request);
    const data = await exportAccountData(session.accountId, session.profileId);
    return NextResponse.json(data, {
      headers: {
        "Content-Disposition": `attachment; filename="medtrack-export-${session.profileId}.json"`,
      },
    });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "account.export" });
  }
}
