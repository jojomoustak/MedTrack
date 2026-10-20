/**
 * The person's own profile photo (owner's request, 2026-10-20: «the user
 * can upload a profile image if they want»), behind
 * `app/api/profile/photo/route.ts`. Built like the medication photos
 * (`lib/medications/server/photo.ts`) where it matters:
 *
 * - **Private storage.** Vercel Blob with `access: "private"`; no client
 *   ever gets a blob URL — the photo is streamed back over the
 *   authenticated route.
 * - **Ownership (CLAUDE.md rule 7).** Every function takes the `profileId`
 *   re-derived from the caller's own session, and the photo's place is
 *   named by it: there is no id in the request that could point at
 *   someone else's.
 * - **One fixed place per profile, no database column.** The photo sits at
 *   `profile-photos/<profileId>/photo.jpg`, overwritten on change, so
 *   nothing in Postgres changes (no migration) and "is there a photo" is
 *   just whether the blob exists. Reads skip the CDN's cache, so a
 *   replaced or removed photo never comes back from it.
 * - **Re-made on the server.** Whatever the phone sends is decoded and
 *   written again as a 512 px centred-square JPEG, upright: nothing of the
 *   original file survives, its metadata included (a phone photo's GPS
 *   location, for one).
 * - **Deleted with the account** (`lib/account/server/delete-account.ts`).
 *
 * Offline: changing the photo needs the network (the app says so); the
 * photo already on the phone keeps showing offline
 * (`lib/account/client/profile-photo.ts`). Not part of the sync outbox: a
 * profile photo is a convenience, not health data the app depends on.
 */
import { del, get, list, put } from "@vercel/blob";
import sharp from "sharp";
import { getEnv } from "@/lib/config/env";
import { ConfigError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { validateMedicationPhotoUpload } from "@/lib/validation/medication-photo";
import { logger } from "@/lib/logging/logger";
import { pseudonymize } from "@/lib/logging/redact";

export const PROFILE_PHOTO_PX = 512;
/**
 * Bounds what one decode can take (security review 2026-10-20: a 592 KB
 * 16-bit interlaced PNG of 50 MP decoded to ~600 MB, four at once past a
 * function's memory). The app sends a 1024 px square
 * (`lib/account/client/profile-photo.ts`); 4096² leaves room for an
 * original the phone couldn't shrink, at 8 bits a channel only.
 */
const MAX_INPUT_PIXELS = 4096 * 4096;
const SHARP_TIMEOUT_SECONDS = 8;
/** The shortest Vercel Blob allows: another device sees a changed photo within a minute. */
const CACHE_SECONDS = 60;

export function profilePhotoFolder(profileId: string): string {
  return `profile-photos/${profileId}/`;
}

function profilePhotoPathname(profileId: string): string {
  return `${profilePhotoFolder(profileId)}photo.jpg`;
}

function assertBlobConfigured(): void {
  const env = getEnv();
  if (!env.BLOB_READ_WRITE_TOKEN && !env.BLOB_STORE_ID) {
    throw new ConfigError("Η αποθήκευση φωτογραφιών δεν έχει ρυθμιστεί ακόμα σε αυτό το περιβάλλον. Δοκιμάστε ξανά αργότερα.");
  }
}

const UNREADABLE = "Δεν ήταν δυνατή η ανάγνωση της φωτογραφίας. Δοκιμάστε μια άλλη.";

/**
 * Read from the header alone, before anything is decoded: too many pixels,
 * more than 8 bits a channel, or an interlaced PNG (decoded whole, and
 * nothing a phone or browser makes for this) are turned away.
 */
async function assertDecodable(bytes: Buffer): Promise<void> {
  let header: sharp.Metadata;
  try {
    header = await sharp(bytes).metadata();
  } catch {
    throw new ValidationError(UNREADABLE);
  }
  const pixels = (header.width ?? 0) * (header.height ?? 0);
  if (!pixels || pixels > MAX_INPUT_PIXELS || header.depth !== "uchar" || (header.format === "png" && header.isProgressive)) {
    throw new ValidationError(UNREADABLE);
  }
}

/** The stored form: upright, centred square, JPEG, no metadata (`sharp` keeps none unless asked). */
export async function makeProfilePhoto(bytes: Buffer): Promise<Buffer> {
  await assertDecodable(bytes);
  try {
    return await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .timeout({ seconds: SHARP_TIMEOUT_SECONDS })
      .rotate()
      // Centred, as the phone crops its own copy (`lib/account/client/profile-photo.ts`): every device shows the same picture.
      .resize(PROFILE_PHOTO_PX, PROFILE_PHOTO_PX, { fit: "cover", position: "centre" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new ValidationError(UNREADABLE);
  }
}

export interface ProfilePhotoContent {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
  etag: string;
}

/** The device's copy is still the current one (`ifNoneMatch` matched). */
export interface ProfilePhotoNotModified {
  notModified: true;
  etag: string;
}

/** Replaces the profile's photo. Returns the stored photo's ETag, so the device keeps it with its copy. */
export async function uploadProfilePhoto(input: { profileId: string; file: { bytes: Uint8Array; contentType: string; size: number } }): Promise<{ etag: string | null }> {
  validateMedicationPhotoUpload({ contentType: input.file.contentType, size: input.file.size, bytes: input.file.bytes });
  assertBlobConfigured();

  const photo = await makeProfilePhoto(Buffer.from(input.file.bytes.buffer, input.file.bytes.byteOffset, input.file.bytes.byteLength));
  const uploaded = await put(profilePhotoPathname(input.profileId), photo, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "image/jpeg",
    cacheControlMaxAge: CACHE_SECONDS,
  });
  logger.info("profile.photo.uploaded", { profileRef: pseudonymize(input.profileId) });
  return { etag: uploaded.etag ?? null };
}

/** The photo's bytes, server-side; `NotFoundError` when there is none. */
export async function getProfilePhoto(params: { profileId: string; ifNoneMatch?: string }): Promise<ProfilePhotoContent | ProfilePhotoNotModified> {
  assertBlobConfigured();
  // Past the CDN's cache, straight from storage: the place is reused, and a cached read could bring back a photo just replaced or removed (security review 2026-10-20).
  const result = await get(profilePhotoPathname(params.profileId), {
    access: "private",
    useCache: false,
    ...(params.ifNoneMatch ? { ifNoneMatch: params.ifNoneMatch } : {}),
  });
  if (result?.statusCode === 304) return { notModified: true, etag: result.blob.etag };
  if (!result || result.statusCode !== 200) throw new NotFoundError("Δεν έχει προστεθεί φωτογραφία προφίλ.");
  return { stream: result.stream, contentType: result.blob.contentType, size: result.blob.size, etag: result.blob.etag };
}

/**
 * The photo for a data export (GDPR Art. 15/20): there's no database row
 * to show it exists, so the export carries the image itself. Null when
 * there's none, or when this environment stores no photos at all; any
 * other storage failure throws, failing the export rather than quietly
 * leaving the photo out.
 */
export async function readProfilePhotoForExport(profileId: string): Promise<{ contentType: string; base64: string } | null> {
  let photo: ProfilePhotoContent | ProfilePhotoNotModified;
  try {
    photo = await getProfilePhoto({ profileId });
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ConfigError) return null;
    throw err;
  }
  if ("notModified" in photo) return null;
  const bytes = Buffer.from(await new Response(photo.stream).arrayBuffer());
  return { contentType: photo.contentType, base64: bytes.toString("base64") };
}

/** «Αφαίρεση»: the one photo, by its place. Idempotent; throws on a storage failure. */
export async function removeProfilePhoto(profileId: string): Promise<void> {
  assertBlobConfigured();
  await del(profilePhotoPathname(profileId));
  logger.info("profile.photo.removed", { profileRef: pseudonymize(profileId) });
}

/**
 * Account deletion's sweep: everything in the profile's photo folder, so
 * nothing is left behind whatever an earlier version stored there.
 * Idempotent; throws on a storage failure (`deleteAccount` logs and
 * carries on).
 */
export async function deleteProfilePhoto(profileId: string): Promise<void> {
  assertBlobConfigured();
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: profilePhotoFolder(profileId), cursor, limit: 1000 });
    const pathnames = page.blobs.map((blob) => blob.pathname);
    if (pathnames.length > 0) await del(pathnames);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  logger.info("profile.photo.deleted", { profileRef: pseudonymize(profileId) });
}
