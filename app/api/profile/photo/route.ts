/**
 * `/api/profile/photo` — the signed-in person's own profile photo
 * (`lib/account/server/profile-photo.ts`). Every method takes the profile
 * from the session (CLAUDE.md rule 7); nothing in the request names whose
 * photo it is. Like the medication photo route, the bytes come back over
 * this authenticated connection, never as a link.
 */
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { getProfilePhoto, removeProfilePhoto, uploadProfilePhoto } from "@/lib/account/server/profile-photo";
import { MAX_MEDICATION_PHOTO_BYTES } from "@/lib/validation/medication-photo";
import { toSafeErrorResponse } from "@/lib/errors/http";
import { RateLimitedError, ValidationError } from "@/lib/errors/app-error";
import { isRateLimited } from "@/lib/catalog/server/rate-limit";

export const runtime = "nodejs";

const PHOTO_FORM_FIELD = "photo";
/** Per account, per server instance (security review 2026-10-20: the search limit, 20 per 10 s, was loose for image work). */
const UPLOADS = { windowMs: 60_000, max: 5 };
const REMOVALS = { windowMs: 60_000, max: 10 };
/** The photo limit plus room for the form's own bytes: anything larger is refused before it's read. */
const MAX_BODY_BYTES = MAX_MEDICATION_PHOTO_BYTES + 64 * 1024;

export async function POST(request: Request) {
  try {
    const session = await requireSessionFromRequest(request);
    // Each upload decodes and re-makes an image on the server: bounded per account.
    if (isRateLimited(`profile-photo-upload:${session.accountId}`, Date.now(), UPLOADS)) {
      throw new RateLimitedError("Πολλές μεταφορτώσεις. Δοκιμάστε ξανά σε λίγο.");
    }
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) throw new ValidationError("Η φωτογραφία είναι πολύ μεγάλη.");

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new ValidationError("Μη έγκυρο αίτημα μεταφόρτωσης.");
    }
    const file = formData.get(PHOTO_FORM_FIELD);
    if (!(file instanceof File)) throw new ValidationError("Δεν βρέθηκε αρχείο φωτογραφίας.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { etag } = await uploadProfilePhoto({ profileId: session.profileId, file: { bytes, contentType: file.type, size: file.size } });
    return NextResponse.json({ uploaded: true, etag });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "profile.photo.upload" });
  }
}

export async function GET(request: Request) {
  try {
    const session = await requireSessionFromRequest(request);
    const ifNoneMatch = request.headers.get("if-none-match") ?? undefined;
    const photo = await getProfilePhoto({ profileId: session.profileId, ifNoneMatch });

    // `private`: one person's own photo, never a shared cache's.
    const cache = "private, no-cache";
    if ("notModified" in photo) return new Response(null, { status: 304, headers: { "Cache-Control": cache, ETag: photo.etag } });
    return new Response(photo.stream, {
      status: 200,
      headers: { "Content-Type": photo.contentType, "Content-Length": String(photo.size), "Cache-Control": cache, ETag: photo.etag },
    });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "profile.photo.get" });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSessionFromRequest(request);
    if (isRateLimited(`profile-photo-remove:${session.accountId}`, Date.now(), REMOVALS)) {
      throw new RateLimitedError("Πολλές αλλαγές μαζί. Δοκιμάστε ξανά σε λίγο.");
    }
    await removeProfilePhoto(session.profileId);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "profile.photo.delete" });
  }
}
