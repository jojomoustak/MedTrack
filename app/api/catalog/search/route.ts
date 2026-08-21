/**
 * GET /api/catalog/search?q=&limit=&offset= — Phase 3 §2.4's Greek
 * catalog search screen. Requires an authenticated session (search
 * happens inside the logged-in "Add Medication" flow) — re-derives
 * identity the same way every other protected route does
 * (`lib/auth/session.ts`); rate-limited per account since this endpoint
 * is otherwise easy to hammer with every keystroke.
 */
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { PostgresCatalogProvider } from "@/lib/catalog/server/postgres-provider";
import { catalogSearchQuerySchema } from "@/lib/validation/catalog";
import { parseOrThrow } from "@/lib/validation/validate";
import { toSafeErrorResponse } from "@/lib/errors/http";
import { RateLimitedError } from "@/lib/errors/app-error";
import { isRateLimited } from "@/lib/catalog/server/rate-limit";

export const runtime = "nodejs";

const provider = new PostgresCatalogProvider();

export async function GET(request: Request) {
  try {
    const session = await requireSessionFromRequest(request);

    if (isRateLimited(session.accountId)) {
      throw new RateLimitedError("Πολλά αιτήματα αναζήτησης. Δοκιμάστε ξανά σε λίγο.");
    }

    const url = new URL(request.url);
    const query = parseOrThrow(catalogSearchQuerySchema, {
      q: url.searchParams.get("q") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });

    const results = await provider.search(query.q, { limit: query.limit, offset: query.offset });
    return NextResponse.json({ results, query: query.q, limit: query.limit, offset: query.offset });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "catalog.search" });
  }
}
