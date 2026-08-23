/**
 * `/api/medications/[id]/photo` — user-uploaded photo of the user's OWN
 * medication package (distinct from the separate `MedicationCatalogProduct`
 * photo-sourcing question, CLAUDE.md rule 5). Every method re-derives
 * `profileId` from the session (never trusts the `[id]` path segment's
 * implied ownership, CLAUDE.md rule 7) and delegates all authorization/
 * validation/storage logic to `lib/medications/server/photo.ts`, which is
 * unit-tested directly — this file stays a thin adapter over HTTP.
 *
 * The photo bytes are NEVER exposed as a bare Vercel Blob URL — `GET`
 * streams them back over this already-authenticated connection, so the
 * client can only ever retrieve a photo through a route that re-checks
 * ownership on every single request, never a bookmarkable/shareable link.
 */
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/session";
import { deleteMedicationPhoto, getMedicationPhoto, uploadMedicationPhoto } from "@/lib/medications/server/photo";
import { toSafeErrorResponse } from "@/lib/errors/http";
import { ValidationError } from "@/lib/errors/app-error";

export const runtime = "nodejs";

const PHOTO_FORM_FIELD = "photo";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSessionFromRequest(request);
    const { id } = await params;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new ValidationError("Μη έγκυρο αίτημα μεταφόρτωσης.");
    }

    const file = formData.get(PHOTO_FORM_FIELD);
    if (!(file instanceof File)) {
      throw new ValidationError("Δεν βρέθηκε αρχείο φωτογραφίας.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    await uploadMedicationPhoto({
      profileId: session.profileId,
      userMedicationId: id,
      file: { bytes, contentType: file.type, size: file.size },
    });

    return NextResponse.json({ uploaded: true });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "medications.photo.upload" });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSessionFromRequest(request);
    const { id } = await params;

    const photo = await getMedicationPhoto({ profileId: session.profileId, userMedicationId: id });

    return new Response(photo.stream, {
      status: 200,
      headers: {
        "Content-Type": photo.contentType,
        "Content-Length": String(photo.size),
        // `private`: this is one user's own content, never a shared CDN
        // cache — the browser/device may cache it, an intermediary must not.
        "Cache-Control": "private, max-age=3600, must-revalidate",
        ETag: photo.etag,
      },
    });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "medications.photo.get" });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSessionFromRequest(request);
    const { id } = await params;

    await deleteMedicationPhoto({ profileId: session.profileId, userMedicationId: id });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "medications.photo.delete" });
  }
}
