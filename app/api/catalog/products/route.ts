/**
 * GET /api/catalog/products?ids=<uuid>,<uuid>,… — the catalog products
 * behind the user's own medications, by id (2026-10-12).
 *
 * After Android "Clear data" (or on a new phone) the medications come back
 * from the cloud restore in moments, but their names live in the catalog,
 * which until now only arrived with the full multi-megabyte offline index —
 * every name showed "Φάρμακο από κατάλογο" meanwhile, and reminders armed
 * in that window carried the placeholder too. This returns just the few
 * products needed (`lib/catalog/client/cache-missing-catalog-products.ts`).
 *
 * `medication_catalog_product` is ownerless reference data (Phase 2 §2.4)
 * that the offline index already serves in full, so there is nothing
 * per-user to authorize beyond a signed-in session; rate-limited per
 * account like `/api/catalog/search`, under its own key so a restore never
 * eats into the search budget.
 */
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { PostgresCatalogProvider } from "@/lib/catalog/server/postgres-provider";
import { catalogProductsQuerySchema } from "@/lib/validation/catalog";
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

    if (isRateLimited(`products:${session.accountId}`)) {
      throw new RateLimitedError("Πολλά αιτήματα. Δοκιμάστε ξανά σε λίγο.");
    }

    const url = new URL(request.url);
    const query = parseOrThrow(catalogProductsQuerySchema, { ids: url.searchParams.get("ids") ?? undefined });

    const products = await getProvider().getByIds(query.ids);
    return NextResponse.json({ products });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "catalog.products" });
  }
}
