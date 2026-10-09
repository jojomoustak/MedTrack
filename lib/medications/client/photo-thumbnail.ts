"use client";

/**
 * Medication photos at the sizes they're actually shown (2026-10-09).
 * Avatars drew the full photo — a phone camera's can be 12 megapixels and
 * several MB — decoded in full for a 60 px circle on every screen, and
 * every upload stored (and every check later downloaded) that full file.
 * Both work on the device; nothing here leaves it except the shrunk
 * upload itself.
 */

/** Avatars are 60 CSS px; 192 px stays sharp on a 3x screen. */
export const THUMBNAIL_PX = 192;
/** An uploaded photo's longest side — plenty to read any package. */
export const UPLOAD_MAX_PX = 2000;
/** A photo already within `UPLOAD_MAX_PX` and under this size is uploaded as-is. */
const UPLOAD_KEEP_BYTES = 1.5 * 1024 * 1024;
const JPEG_QUALITY = 0.85;

async function decode(photo: Blob): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    return await createImageBitmap(photo);
  } catch {
    return null;
  }
}

function drawToJpeg(bitmap: ImageBitmap, source: { x: number; y: number; width: number; height: number }, width: number, height: number): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", JPEG_QUALITY));
}

/** A centred square `THUMBNAIL_PX` JPEG of `photo` (avatars crop to a circle anyway), or null where the browser can't decode it. */
export async function makePhotoThumbnail(photo: Blob): Promise<Blob | null> {
  const bitmap = await decode(photo);
  if (!bitmap) return null;
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    return await drawToJpeg(bitmap, { x: (bitmap.width - side) / 2, y: (bitmap.height - side) / 2, width: side, height: side }, THUMBNAIL_PX, THUMBNAIL_PX);
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

/**
 * `file` scaled down to `UPLOAD_MAX_PX` on its longest side, as a JPEG —
 * or `file` itself when it's already small, when shrinking wouldn't make
 * it smaller, or when the browser can't decode it.
 */
export async function shrinkPhotoForUpload(file: File): Promise<File> {
  const bitmap = await decode(file);
  if (!bitmap) return file;
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= UPLOAD_MAX_PX && file.size <= UPLOAD_KEEP_BYTES) return file;
    const scale = Math.min(1, UPLOAD_MAX_PX / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const shrunk = await drawToJpeg(bitmap, { x: 0, y: 0, width: bitmap.width, height: bitmap.height }, width, height);
    if (!shrunk || shrunk.size >= file.size) return file;
    return new File([shrunk], "medication-photo.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
