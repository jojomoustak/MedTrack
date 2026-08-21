/**
 * POST /api/sync/mutations — the outbox worker's drain target.
 *
 * Re-derives `profile_id`/`account_id` from the authenticated session
 * exactly like every other protected route (`lib/auth/session.ts`) —
 * never trusts a client-supplied profile/account id (CLAUDE.md rule 7).
 * Idempotent per mutation via `sync_mutation.client_mutation_id`
 * (`lib/sync/server/mutations.ts`).
 */
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { applyMutations } from "@/lib/sync/server/mutations";
import { syncMutationsRequestBodySchema, type SyncMutationsResponseBody } from "@/lib/sync/protocol";
import { parseOrThrow } from "@/lib/validation/validate";
import { toSafeErrorResponse } from "@/lib/errors/http";
import { logger } from "@/lib/logging/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requireSessionFromRequest(request);
    const body = parseOrThrow(syncMutationsRequestBodySchema, await request.json());

    const results = await applyMutations({ profileId: session.profileId, accountId: session.accountId }, body.mutations);

    logger.info("sync.mutations.processed", {
      count: results.length,
      applied: results.filter((r) => r.result === "applied").length,
      conflicts: results.filter((r) => r.result === "conflict").length,
    });

    const responseBody: SyncMutationsResponseBody = { results };
    return NextResponse.json(responseBody);
  } catch (err) {
    return toSafeErrorResponse(err, { route: "sync.mutations" });
  }
}
