/**
 * Small medication-photo thumbnails, kept next to each photo in private
 * blob storage and handed to a device all at once (2026-10-15).
 *
 * Why: avatars on Today, the Calendar and the Medications tab used to each
 * download their medication's FULL photo (150 KB to several MB) and shrink
 * it on the phone, one request per medication, every ten minutes, and again
 * after every sign-in. A few photos made the first screen slow (Algofren,
 * owner-reported); a hundred would be tens of MB and a hundred full-size
 * decodes on the phone. Now each photo has a ~10 KB JPEG thumbnail beside
 * it, and one request (`listMedicationPhotoThumbnails`) gives a device every
 * thumbnail it doesn't have yet. The full photo is only ever fetched by the
 * photo screen.
 *
 * Storage: the thumbnail lives at `<photo pathname>.thumb.jpg`, so it needs
 * no column of its own and goes wherever the photo goes (replaced, removed,
 * deleted with the account). A photo uploaded before this existed gets its
 * thumbnail made the first time a device asks.
 *
 * Privacy: the same private blobs as the photos; no pathname or blob URL
 * ever reaches a client. A device only learns a short, one-way fingerprint
 * of the photo's pathname as its version. sharp writes no metadata unless
 * asked, so a thumbnail never carries the original's EXIF (location, etc.).
 */
import { createHash } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import sharp from "sharp";
import { sql } from "drizzle-orm";
import { getDb, type Db, type TestableDb } from "@/lib/db/client";
import { withProfileScope } from "@/lib/db/rls";
import { logger } from "@/lib/logging/logger";
import { pseudonymize } from "@/lib/logging/redact";

type AnyDb = Db | TestableDb;

/** Matches the phone's own thumbnails (`lib/medications/client/photo-thumbnail.ts`): a 192 px centred square, shown at ≤ 64 px. */
export const THUMBNAIL_PX = 192;
/**
 * A decoded photo larger than this is refused rather than resized: a
 * decompression-bomb and memory guard (security review, 2026-10-15). Uploads
 * are shrunk to 2000 px on the phone; a 12 MP original is well within it.
 */
const MAX_INPUT_PIXELS = 25_000_000;
/** No thumbnail may take longer than this to make. */
const SHARP_TIMEOUT_SECONDS = 5;
/** A photo whose thumbnail just failed isn't read again for this long (per server instance): a corrupt photo can't make every request redo the work. */
const FAILURE_BACKOFF_MS = 60 * 60_000;
const recentFailures = new Map<string, number>();
/** Thumbnails returned per request; a device with more asks again (`more`). Keeps one response small and well inside a function's time. */
export const MAX_THUMBNAILS_PER_RESPONSE = 40;
/** Blob reads (and backfills) at once, per request. */
const CONCURRENCY = 6;

export function thumbnailPathnameFor(photoBlobKey: string): string {
  return `${photoBlobKey}.thumb.jpg`;
}

/** What a device compares to know whether its thumbnail is current: changes with every new photo, reveals nothing about the pathname. */
export function photoVersionFor(photoBlobKey: string): string {
  return createHash("sha256").update(photoBlobKey).digest("hex").slice(0, 16);
}

/** A 192 px centred-square JPEG of a photo, upright (EXIF orientation applied, then dropped). */
export async function makeThumbnail(photo: Buffer): Promise<Buffer> {
  return sharp(photo, { limitInputPixels: MAX_INPUT_PIXELS })
    .timeout({ seconds: SHARP_TIMEOUT_SECONDS })
    .rotate()
    .resize(THUMBNAIL_PX, THUMBNAIL_PX, { fit: "cover", position: "centre" })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
}

/** A photo's thumbnail, or null if it can't be made (not an image sharp can read, too large, too slow). Never throws. */
export async function makeThumbnailOrNull(photo: Buffer): Promise<Buffer | null> {
  try {
    return await makeThumbnail(photo);
  } catch (err) {
    logger.warn("medication.photo.thumbnail_failed", { errorName: err instanceof Error ? err.name : "unknown" });
    return null;
  }
}

/** Stores a thumbnail beside its photo. Best-effort: returns whether it was stored; never throws. */
export async function putThumbnail(photoBlobKey: string, thumbnail: Buffer): Promise<boolean> {
  try {
    await put(thumbnailPathnameFor(photoBlobKey), thumbnail, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "image/jpeg" });
    return true;
  } catch (err) {
    logger.warn("medication.photo.thumbnail_store_failed", { errorName: err instanceof Error ? err.name : "unknown" });
    return false;
  }
}

async function readBlob(pathname: string): Promise<Buffer | null> {
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

/**
 * The stored thumbnail, or one made now from the photo if it has none yet
 * (photos from before thumbnails existed); `backfilled` says it was made
 * now. A photo that failed recently isn't tried again until the backoff ends.
 */
async function thumbnailFor(photoBlobKey: string): Promise<{ thumbnail: Buffer; backfilled: boolean } | null> {
  const stored = await readBlob(thumbnailPathnameFor(photoBlobKey));
  if (stored) return { thumbnail: stored, backfilled: false };
  const failedAt = recentFailures.get(photoBlobKey);
  if (failedAt !== undefined && Date.now() - failedAt < FAILURE_BACKOFF_MS) return null;
  const photo = await readBlob(photoBlobKey);
  const thumbnail = photo ? await makeThumbnailOrNull(photo) : null;
  if (!thumbnail) {
    recentFailures.set(photoBlobKey, Date.now());
    return null;
  }
  await putThumbnail(photoBlobKey, thumbnail);
  return { thumbnail, backfilled: true };
}

async function selectPhotoRows(profileId: string, db: AnyDb): Promise<{ id: string; key: string }[]> {
  const [result] = await withProfileScope(
    profileId,
    (scopedDb) => [
      scopedDb.execute(sql`
        SELECT id, photo_blob_key FROM user_medication
        WHERE profile_id = ${profileId}::uuid AND photo_blob_key IS NOT NULL AND deleted_at IS NULL
        ORDER BY id
      `),
    ],
    { db },
  );
  return ((result as { rows?: Record<string, unknown>[] }).rows ?? []).map((row) => ({ id: row.id as string, key: row.photo_blob_key as string }));
}

export interface PhotoThumbnailEntry {
  userMedicationId: string;
  version: string;
  /** Base64 JPEG. Absent when the device already has this version, or when it isn't sent this time (see `more`). */
  data?: string;
}

export interface PhotoThumbnailsResponse {
  /** Every one of the profile's medications that has a photo right now. A medication the device knows but that isn't listed has none. */
  photos: PhotoThumbnailEntry[];
  /** More thumbnails to send: ask again with what was just received. */
  more: boolean;
}

/**
 * Every photo the profile's medications have, with the thumbnail data for
 * those whose version differs from `known` (medication id → version the
 * device holds). Owner-scoped like every photo read: only this profile's
 * own medications are ever looked at.
 */
export async function listMedicationPhotoThumbnails(profileId: string, known: Record<string, string>, dbOverride?: AnyDb): Promise<PhotoThumbnailsResponse> {
  const db = dbOverride ?? getDb();
  const rows = await selectPhotoRows(profileId, db);

  const photos: PhotoThumbnailEntry[] = rows.map((row) => ({ userMedicationId: row.id, version: photoVersionFor(row.key) }));
  const stale = rows.filter((row, i) => known[row.id] !== photos[i].version);
  const now = stale.slice(0, MAX_THUMBNAILS_PER_RESPONSE);
  const byId = new Map(photos.map((p) => [p.userMedicationId, p]));
  const backfilled: { id: string; key: string }[] = [];

  for (let i = 0; i < now.length; i += CONCURRENCY) {
    await Promise.all(
      now.slice(i, i + CONCURRENCY).map(async (row) => {
        try {
          const found = await thumbnailFor(row.key);
          if (!found) return;
          byId.get(row.id)!.data = found.thumbnail.toString("base64");
          if (found.backfilled) backfilled.push(row);
        } catch (err) {
          logger.warn("medication.photo.thumbnail_read_failed", { medicationRef: pseudonymize(row.id), errorName: err instanceof Error ? err.name : "unknown" });
        }
      }),
    );
  }

  // A thumbnail made just now from a photo that was meanwhile replaced or
  // removed would outlive it, with nothing pointing at it: drop it, and don't
  // send it (security review, 2026-10-15).
  if (backfilled.length > 0) {
    const current = new Map((await selectPhotoRows(profileId, db)).map((row) => [row.id, row.key]));
    for (const row of backfilled) {
      if (current.get(row.id) === row.key) continue;
      await del(thumbnailPathnameFor(row.key)).catch(() => {});
      const entry = byId.get(row.id)!;
      delete entry.data;
      const newKey = current.get(row.id);
      if (newKey) entry.version = photoVersionFor(newKey);
      else byId.delete(row.id);
    }
  }

  // Every photo is listed. One without data and with a version the device
  // doesn't hold simply wasn't sent this time (over the per-response limit,
  // or it couldn't be read): the device keeps what it has and asks again.
  return { photos: photos.filter((p) => byId.has(p.userMedicationId)), more: stale.length > now.length };
}
