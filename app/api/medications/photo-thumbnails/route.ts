/**
 * POST /api/medications/photo-thumbnails — every medication photo's small
 * thumbnail a device doesn't have yet, in one request (2026-10-15; see
 * `lib/medications/server/photo-thumbnails.ts`). Body: `{ known: { [medication
 * id]: version } }`, the thumbnails the device already holds. A POST only so
 * a long list fits in the body; nothing is changed (except that a photo from
 * before thumbnails existed gets its thumbnail made and stored).
 *
 * Only the signed-in profile's own medications are ever read. The answer is
 * never cached by the browser or anything in between.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { listMedicationPhotoThumbnails } from "@/lib/medications/server/photo-thumbnails";
import { isRateLimited } from "@/lib/catalog/server/rate-limit";
import { RateLimitedError, ValidationError } from "@/lib/errors/app-error";
import { toSafeErrorResponse } from "@/lib/errors/http";
import { parseOrThrow } from "@/lib/validation/validate";
import { uuidSchema } from "@/lib/validation/common";

export const runtime = "nodejs";
// Room for first-time thumbnails of older photos to be made in one go.
export const maxDuration = 30;

const MAX_KNOWN = 2000;

const bodySchema = z.object({
  known: z
    .record(uuidSchema, z.string().regex(/^[0-9a-f]{16}$/))
    .refine((known) => Object.keys(known).length <= MAX_KNOWN, "Too many entries.")
    .default({}),
});

export async function POST(request: Request) {
  try {
    const session = await requireSessionFromRequest(request);
    if (isRateLimited(`photo-thumbnails:${session.accountId}`)) {
      throw new RateLimitedError("Πολλά αιτήματα. Δοκιμάστε ξανά σε λίγο.");
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new ValidationError("Μη έγκυρο αίτημα.");
    }
    const { known } = parseOrThrow(bodySchema, raw);

    const result = await listMedicationPhotoThumbnails(session.profileId, known);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "medications.photo_thumbnails" });
  }
}
