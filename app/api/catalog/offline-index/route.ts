/**
 * GET /api/catalog/offline-index — the full compact offline-index payload
 * (spec §12/§17), fetched only after `/api/catalog/offline-index/manifest`
 * shows the device's stored version is stale. Real measured size at
 * ~9,400 records: 2.88MB uncompressed, 665KB gzip-compressed (standard
 * HTTP compression applies automatically over `fetch` — no manual gzip
 * needed here). Returns `{ manifest, entries }` together so the client can
 * verify the payload's own manifest (record count, checksum) matches what
 * it expects before ever writing anything to local storage (spec §18).
 */
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { generateOfflineIndex } from "@/lib/catalog/server/offline-index";
import { toSafeErrorResponse } from "@/lib/errors/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireSessionFromRequest(request);

    const index = await generateOfflineIndex();
    return NextResponse.json(index, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "catalog.offline-index" });
  }
}
