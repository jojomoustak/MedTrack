/**
 * POST /api/catalog/confirm-identifier — records one profile's explicit
 * confirmation of an OCR (or manual-search) candidate as a USER_CONFIRMED
 * `medication_identifier` row (OCR-fallback task spec §12/§14/§16/§19).
 *
 * This is the server-side half of "account sync" for learned mappings
 * (spec §16): the primary, always-available resolution path is the local
 * `learnedGtinMapping` Dexie table (spec §15 — works fully offline, no
 * network round-trip needed to resolve a previously-confirmed GTIN again).
 * This endpoint is called best-effort, immediately after a local
 * confirmation succeeds, so the SAME confirmation is durable server-side
 * too and can survive an app-data clear/reinstall/new device — but a
 * failure here (offline, network error) never blocks or undoes the local
 * confirmation, which already fully satisfies spec §15 on its own.
 */
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { PostgresCatalogProvider } from "@/lib/catalog/server/postgres-provider";
import { catalogConfirmIdentifierBodySchema } from "@/lib/validation/catalog-identifier";
import { parseOrThrow } from "@/lib/validation/validate";
import { toSafeErrorResponse } from "@/lib/errors/http";
import { RateLimitedError } from "@/lib/errors/app-error";
import { isRateLimited } from "@/lib/catalog/server/rate-limit";

export const runtime = "nodejs";

let providerSingleton: PostgresCatalogProvider | undefined;
function getProvider(): PostgresCatalogProvider {
  return (providerSingleton ??= new PostgresCatalogProvider());
}

export async function POST(request: Request) {
  try {
    const session = await requireSessionFromRequest(request);

    if (isRateLimited(session.accountId)) {
      throw new RateLimitedError("Πολλά αιτήματα. Δοκιμάστε ξανά σε λίγο.");
    }

    const body = parseOrThrow(catalogConfirmIdentifierBodySchema, await request.json());
    const outcome = await getProvider().confirmIdentifier(body.type, body.value, body.catalogProductId, session.profileId);
    return NextResponse.json(outcome);
  } catch (err) {
    return toSafeErrorResponse(err, { route: "catalog.confirm_identifier" });
  }
}
