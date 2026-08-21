/**
 * GET /api/me — minimal "who am I" endpoint so client components can
 * learn their own `profileId`/`accountId` without duplicating session
 * logic (`lib/auth/session.ts`). No login/register UI exists yet
 * (deferred to a later phase per ADR-003/Phase 4) — this just gives any
 * already-authenticated client (via Better Auth's session cookie) a way
 * to bootstrap the identity it needs for profile-scoped local writes
 * (e.g. `components/medications/AddMedicationFlow.tsx`).
 */
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { toSafeErrorResponse } from "@/lib/errors/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await requireSessionFromRequest(request);
    return NextResponse.json({ profileId: session.profileId, accountId: session.accountId });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "me" });
  }
}
