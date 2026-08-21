/**
 * GET /api/sync/changes?cursor=&limit= — cursor-based pull from
 * `sync_change_log` (Phase 1 §5, Phase 2 §5.1), the single feed a device
 * reads instead of polling every entity table.
 */
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { pullChanges } from "@/lib/sync/server/changes";
import { syncChangesQuerySchema } from "@/lib/sync/protocol";
import { parseOrThrow } from "@/lib/validation/validate";
import { toSafeErrorResponse } from "@/lib/errors/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await requireSessionFromRequest(request);
    const url = new URL(request.url);
    const query = parseOrThrow(syncChangesQuerySchema, {
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const body = await pullChanges(session.profileId, session.accountId, query.cursor, query.limit);
    return NextResponse.json(body);
  } catch (err) {
    return toSafeErrorResponse(err, { route: "sync.changes" });
  }
}
