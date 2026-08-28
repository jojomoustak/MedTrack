/**
 * GET /api/catalog/offline-index/manifest — the device-side sync check
 * (spec §16): compare the returned `version` against whatever's already
 * stored locally; identical → nothing to do; different → fetch the full
 * index from `/api/catalog/offline-index`. Deliberately a separate,
 * lightweight endpoint from the full-payload one — a device shouldn't
 * have to download 9,000+ records just to learn nothing changed.
 *
 * Computing the manifest still means building the full index server-side
 * (the version is a content hash) — at current record counts (~9,400)
 * this is a few hundred ms, not worth caching yet (don't optimize
 * prematurely, spec §14). Revisit if/when this becomes a measured cost.
 */
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { generateOfflineIndex } from "@/lib/catalog/server/offline-index";
import { toSafeErrorResponse } from "@/lib/errors/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireSessionFromRequest(request);

    const { manifest } = await generateOfflineIndex();
    return NextResponse.json(manifest, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "catalog.offline-index.manifest" });
  }
}
