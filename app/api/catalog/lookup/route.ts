/**
 * GET /api/catalog/lookup?gtin= — Phase 1 §7's scan flow server lookup,
 * hit only when the local cache (`lib/db-client/catalog-cache-repository.ts`)
 * misses and the device is online (`lib/catalog/client/lookup-gtin.ts`).
 * Requires an authenticated session and is rate-limited, mirroring
 * `/api/catalog/search` — this endpoint has the same "otherwise easy to
 * hammer" shape (a bad scan loop retried repeatedly).
 */
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { PostgresCatalogProvider } from "@/lib/catalog/server/postgres-provider";
import { catalogLookupQuerySchema } from "@/lib/validation/catalog";
import { parseOrThrow } from "@/lib/validation/validate";
import { toSafeErrorResponse } from "@/lib/errors/http";
import { RateLimitedError } from "@/lib/errors/app-error";
import { isRateLimited } from "@/lib/catalog/server/rate-limit";

export const runtime = "nodejs";

// Lazy singleton for the same build-time-safety reason as
// `/api/catalog/search/route.ts` — see that file's comment.
let providerSingleton: PostgresCatalogProvider | undefined;
function getProvider(): PostgresCatalogProvider {
  return (providerSingleton ??= new PostgresCatalogProvider());
}

export async function GET(request: Request) {
  try {
    const session = await requireSessionFromRequest(request);

    if (isRateLimited(session.accountId)) {
      throw new RateLimitedError("Πολλά αιτήματα αναζήτησης. Δοκιμάστε ξανά σε λίγο.");
    }

    const url = new URL(request.url);
    const query = parseOrThrow(catalogLookupQuerySchema, {
      gtin: url.searchParams.get("gtin") ?? undefined,
    });

    const product = await getProvider().lookupByGtin(query.gtin);
    return NextResponse.json({ product, gtin: query.gtin });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "catalog.lookup" });
  }
}
