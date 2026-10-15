import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { Db } from "@/lib/db/client";

vi.mock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));

import { del, get, put } from "@vercel/blob";
import {
  MAX_THUMBNAILS_PER_RESPONSE,
  THUMBNAIL_PX,
  listMedicationPhotoThumbnails,
  makeThumbnail,
  photoVersionFor,
  thumbnailPathnameFor,
} from "@/lib/medications/server/photo-thumbnails";

const PROFILE_ID = "11111111-1111-1111-1111-111111111111";

/** A real JPEG, landscape, with a location in its EXIF. */
async function phonePhoto(): Promise<Buffer> {
  return sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .jpeg()
    .withExif({ IFD0: { Make: "TestPhone" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 58/1 0/1" } })
    .toBuffer();
}

/** `withProfileScope` only needs `.execute()` and `.batch()` (same fake as `photo.test.ts`). */
function fakeDb(rows: { id: string; photo_blob_key: string }[]): Db {
  return {
    execute: vi.fn((query: unknown) => ({ query })),
    // The first result answers the profile-scope set_config, as in a real batch.
    batch: vi.fn(async () => ["set_config_result", { rows }]),
  } as unknown as Db;
}

function blobResponse(bytes: Buffer) {
  return { statusCode: 200, stream: new Response(new Uint8Array(bytes)).body, blob: { contentType: "image/jpeg", size: bytes.length, etag: '"x"' } };
}

const medId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

beforeEach(() => {
  vi.mocked(get).mockReset();
  vi.mocked(put).mockReset().mockResolvedValue({} as never);
  vi.mocked(del).mockReset().mockResolvedValue(undefined);
});

describe("makeThumbnail", () => {
  it("is a small upright square JPEG that keeps none of the photo's metadata (no location)", async () => {
    const thumbnail = await makeThumbnail(await phonePhoto());
    const meta = await sharp(thumbnail).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([THUMBNAIL_PX, THUMBNAIL_PX]);
    expect(meta.exif).toBeUndefined();
    expect(thumbnail.length).toBeLessThan(20_000);
  });
});

describe("listMedicationPhotoThumbnails", () => {
  it("sends thumbnails the device lacks, nothing for the ones it already has", async () => {
    const thumb = await makeThumbnail(await phonePhoto());
    const rows = [
      { id: medId(1), photo_blob_key: "medication-photos/p/1-abc" },
      { id: medId(2), photo_blob_key: "medication-photos/p/2-def" },
    ];
    vi.mocked(get).mockImplementation(async () => blobResponse(thumb) as never);

    const result = await listMedicationPhotoThumbnails(PROFILE_ID, { [medId(2)]: photoVersionFor("medication-photos/p/2-def") }, fakeDb(rows));

    expect(result.more).toBe(false);
    expect(result.photos).toEqual([
      { userMedicationId: medId(1), version: photoVersionFor("medication-photos/p/1-abc"), data: thumb.toString("base64") },
      { userMedicationId: medId(2), version: photoVersionFor("medication-photos/p/2-def") },
    ]);
    expect(vi.mocked(get).mock.calls.map(([path]) => path)).toEqual([thumbnailPathnameFor("medication-photos/p/1-abc")]);
  });

  it("a photo from before thumbnails existed gets one made from it, and stored for next time", async () => {
    const photo = await phonePhoto();
    vi.mocked(get).mockImplementation(async (path: string) => (path.endsWith(".thumb.jpg") ? null : blobResponse(photo)) as never);

    const result = await listMedicationPhotoThumbnails(PROFILE_ID, {}, fakeDb([{ id: medId(1), photo_blob_key: "medication-photos/p/old" }]));

    const data = Buffer.from(result.photos[0].data!, "base64");
    expect((await sharp(data).metadata()).width).toBe(THUMBNAIL_PX);
    const [path, , options] = vi.mocked(put).mock.calls[0];
    expect(path).toBe("medication-photos/p/old.thumb.jpg");
    expect(options).toMatchObject({ access: "private", addRandomSuffix: false });
  });

  it("a thumbnail made just as its photo was replaced is deleted, not left behind or sent (security review)", async () => {
    const photo = await phonePhoto();
    vi.mocked(get).mockImplementation(async (path: string) => (path.endsWith(".thumb.jpg") ? null : blobResponse(photo)) as never);
    let selects = 0;
    const db = {
      execute: vi.fn((query: unknown) => ({ query })),
      // First read: the old photo. Re-check after making its thumbnail: replaced meanwhile.
      batch: vi.fn(async () => ["set_config_result", { rows: [{ id: medId(1), photo_blob_key: selects++ === 0 ? "medication-photos/p/old-x" : "medication-photos/p/new-y" }] }]),
    } as unknown as Db;

    const result = await listMedicationPhotoThumbnails(PROFILE_ID, {}, db);

    expect(del).toHaveBeenCalledWith("medication-photos/p/old-x.thumb.jpg");
    expect(result.photos).toEqual([{ userMedicationId: medId(1), version: photoVersionFor("medication-photos/p/new-y") }]);
  });

  it("never reveals a photo's storage path to the device", async () => {
    const thumb = await makeThumbnail(await phonePhoto());
    vi.mocked(get).mockImplementation(async () => blobResponse(thumb) as never);
    const result = await listMedicationPhotoThumbnails(PROFILE_ID, {}, fakeDb([{ id: medId(1), photo_blob_key: "medication-photos/secret-path" }]));
    expect(JSON.stringify(result)).not.toContain("medication-photos");
    expect(result.photos[0].version).toMatch(/^[0-9a-f]{16}$/);
  });

  it("sends at most a page of thumbnails and says there are more", async () => {
    const thumb = await makeThumbnail(await phonePhoto());
    vi.mocked(get).mockImplementation(async () => blobResponse(thumb) as never);
    const rows = Array.from({ length: MAX_THUMBNAILS_PER_RESPONSE + 5 }, (_, i) => ({ id: medId(i), photo_blob_key: `medication-photos/p/${i}` }));

    const result = await listMedicationPhotoThumbnails(PROFILE_ID, {}, fakeDb(rows));

    expect(result.more).toBe(true);
    expect(result.photos).toHaveLength(rows.length);
    expect(result.photos.filter((p) => p.data)).toHaveLength(MAX_THUMBNAILS_PER_RESPONSE);
  });

  it("a thumbnail that can't be read is listed without data, not left out (it isn't 'no photo')", async () => {
    vi.mocked(get).mockRejectedValue(new Error("blob outage"));
    const result = await listMedicationPhotoThumbnails(PROFILE_ID, {}, fakeDb([{ id: medId(1), photo_blob_key: "medication-photos/p/1" }]));
    expect(result.photos).toEqual([{ userMedicationId: medId(1), version: photoVersionFor("medication-photos/p/1") }]);
  });
});
