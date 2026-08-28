/**
 * GET /api/catalog/resolve-identifier?type=&value= — the real multi-
 * identifier GTIN resolution path (GTIN-resolution task spec §3/§19),
 * hit only when the local offline index misses and the device is online
 * (`lib/catalog/client/lookup-gtin.ts`). Returns the full three-state
 * `IdentifierResolution` (`EXACT`/`CONFLICT`/`VALID_IDENTIFIER_UNRESOLVED`)
 * — distinct from `/api/catalog/lookup`, which only ever returns a single
 * product-or-null and cannot represent a genuine cross-product conflict.
 */
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { PostgresCatalogProvider } from "@/lib/catalog/server/postgres-provider";
import { catalogResolveIdentifierQuerySchema } from "@/lib/validation/catalog-identifier";
import { parseOrThrow } from "@/lib/validation/validate";
import { toSafeErrorResponse } from "@/lib/errors/http";
import { RateLimitedError } from "@/lib/errors/app-error";
import { isRateLimited } from "@/lib/catalog/server/rate-limit";

export const runtime = "nodejs";

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
    const query = parseOrThrow(catalogResolveIdentifierQuerySchema, {
      type: url.searchParams.get("type") ?? undefined,
      value: url.searchParams.get("value") ?? undefined,
    });

    const resolution = await getProvider().lookupByIdentifier(query.type, query.value);
    return NextResponse.json(resolution);
  } catch (err) {
    return toSafeErrorResponse(err, { route: "catalog.resolve_identifier" });
  }
}
