import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn(), del: vi.fn(), list: vi.fn() }));

import { del, get, list, put } from "@vercel/blob";
import { __resetEnvCacheForTests } from "@/lib/config/env";
import { deleteProfilePhoto, getProfilePhoto, readProfilePhotoForExport, removeProfilePhoto, uploadProfilePhoto } from "@/lib/account/server/profile-photo";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";

const PROFILE = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  // The rest of the env shape `getEnv()` requires (same as `lib/medications/server/photo.test.ts`).
  process.env.GOOGLE_CLIENT_ID ??= "test-client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";
  process.env.ACCOUNT_ID_HASH_PEPPER ??= "test-pepper-at-least-32-characters-long";
  __resetEnvCacheForTests();
  vi.mocked(put).mockResolvedValue({ etag: '"e1"', pathname: `profile-photos/${PROFILE}/photo.jpg` } as never);
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  __resetEnvCacheForTests();
});

/** A phone-like JPEG: landscape, with EXIF (a stand-in for the GPS a camera adds). */
async function phoneJpeg(): Promise<Uint8Array> {
  const buffer = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 30, g: 120, b: 90 } } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: "secret-location-stand-in" } } })
    .toBuffer();
  return new Uint8Array(buffer);
}

describe("uploadProfilePhoto", () => {
  it("stores a 512 px square JPEG without the original's metadata, at the profile's own place", async () => {
    const bytes = await phoneJpeg();
    const { etag } = await uploadProfilePhoto({ profileId: PROFILE, file: { bytes, contentType: "image/jpeg", size: bytes.length } });

    expect(etag).toBe('"e1"');
    const [pathname, body, options] = vi.mocked(put).mock.calls[0];
    expect(pathname).toBe(`profile-photos/${PROFILE}/photo.jpg`);
    expect(options).toMatchObject({ access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "image/jpeg" });

    const stored = await sharp(body as Buffer).metadata();
    expect(stored.format).toBe("jpeg");
    expect([stored.width, stored.height]).toEqual([512, 512]);
    expect(stored.exif).toBeUndefined();
    expect((body as Buffer).includes(Buffer.from("secret-location-stand-in"))).toBe(false);
  });

  it("refuses something that isn't an image, storing nothing", async () => {
    const bytes = new TextEncoder().encode("<html>not a photo</html>");
    await expect(uploadProfilePhoto({ profileId: PROFILE, file: { bytes, contentType: "image/jpeg", size: bytes.length } })).rejects.toBeInstanceOf(ValidationError);
    expect(put).not.toHaveBeenCalled();
  });
});

// Security review 2026-10-20: a small 16-bit interlaced PNG decoded to ~600 MB.
describe("uploadProfilePhoto — refused before anything is decoded", () => {
  async function attempt(buffer: Buffer, contentType: string) {
    const bytes = new Uint8Array(buffer);
    return uploadProfilePhoto({ profileId: PROFILE, file: { bytes, contentType, size: bytes.length } });
  }

  it("more than 8 bits a channel", async () => {
    const deep = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } }).toColourspace("rgb16").png().toBuffer();
    await expect(attempt(deep, "image/png")).rejects.toBeInstanceOf(ValidationError);
  });

  it("an interlaced PNG", async () => {
    const interlaced = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png({ progressive: true }).toBuffer();
    await expect(attempt(interlaced, "image/png")).rejects.toBeInstanceOf(ValidationError);
  });

  it("too many pixels", async () => {
    const huge = await sharp({ create: { width: 5000, height: 4000, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png({ compressionLevel: 9 }).toBuffer();
    await expect(attempt(huge, "image/png")).rejects.toBeInstanceOf(ValidationError);
    expect(put).not.toHaveBeenCalled();
  });
});

describe("getProfilePhoto", () => {
  it("is NotFound when there's no photo", async () => {
    vi.mocked(get).mockResolvedValue(null);
    await expect(getProfilePhoto({ profileId: PROFILE })).rejects.toBeInstanceOf(NotFoundError);
    expect(vi.mocked(get).mock.calls[0][0]).toBe(`profile-photos/${PROFILE}/photo.jpg`);
  });

  it("reads past the CDN's cache, so a replaced or removed photo can't come back from it", async () => {
    vi.mocked(get).mockResolvedValue(null);
    await getProfilePhoto({ profileId: PROFILE }).catch(() => undefined);
    expect(vi.mocked(get).mock.calls[0][1]).toMatchObject({ access: "private", useCache: false });
  });

  it("answers «not modified» when the phone's copy is current", async () => {
    vi.mocked(get).mockResolvedValue({ statusCode: 304, blob: { etag: '"e1"' } } as never);
    await expect(getProfilePhoto({ profileId: PROFILE, ifNoneMatch: '"e1"' })).resolves.toEqual({ notModified: true, etag: '"e1"' });
  });
});

describe("removeProfilePhoto («Αφαίρεση»)", () => {
  it("deletes the one photo by its place, no listing needed", async () => {
    await removeProfilePhoto(PROFILE);
    expect(del).toHaveBeenCalledWith(`profile-photos/${PROFILE}/photo.jpg`);
    expect(list).not.toHaveBeenCalled();
  });
});

describe("readProfilePhotoForExport", () => {
  it("carries the image itself", async () => {
    vi.mocked(get).mockResolvedValue({ statusCode: 200, stream: new Blob(["jpeg-bytes"]).stream(), blob: { contentType: "image/jpeg", size: 10, etag: '"e1"' } } as never);
    await expect(readProfilePhotoForExport(PROFILE)).resolves.toEqual({ contentType: "image/jpeg", base64: Buffer.from("jpeg-bytes").toString("base64") });
  });

  it("is null when there's none", async () => {
    vi.mocked(get).mockResolvedValue(null);
    await expect(readProfilePhotoForExport(PROFILE)).resolves.toBeNull();
  });

  it("fails the export on a storage failure rather than leaving the photo out", async () => {
    vi.mocked(get).mockRejectedValue(new Error("storage down"));
    await expect(readProfilePhotoForExport(PROFILE)).rejects.toThrow("storage down");
  });
});

describe("deleteProfilePhoto", () => {
  it("removes everything in the profile's photo folder, and nothing else's", async () => {
    vi.mocked(list).mockResolvedValue({ blobs: [{ pathname: `profile-photos/${PROFILE}/photo.jpg` }], hasMore: false } as never);
    await deleteProfilePhoto(PROFILE);
    expect(vi.mocked(list).mock.calls[0][0]).toMatchObject({ prefix: `profile-photos/${PROFILE}/` });
    expect(del).toHaveBeenCalledWith([`profile-photos/${PROFILE}/photo.jpg`]);
  });

  it("is a no-op when there's nothing to remove", async () => {
    vi.mocked(list).mockResolvedValue({ blobs: [], hasMore: false } as never);
    await deleteProfilePhoto(PROFILE);
    expect(del).not.toHaveBeenCalled();
  });
});
