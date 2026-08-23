import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import { __resetEnvCacheForTests } from "@/lib/config/env";
import { ConfigError, NotFoundError, ValidationError } from "@/lib/errors/app-error";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}));

// Imported AFTER the mock so these bindings are the mocked functions.
import { del, get, put } from "@vercel/blob";
import {
  collectMedicationPhotoBlobKeysForProfile,
  deleteMedicationPhoto,
  getMedicationPhoto,
  uploadMedicationPhoto,
} from "@/lib/medications/server/photo";

const PROFILE_ID = "11111111-1111-1111-1111-111111111111";
const MEDICATION_ID = "22222222-2222-2222-2222-222222222222";
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

/**
 * Fake `Db` in the same spirit as `lib/db/rls.test.ts`'s `buildFakeDb`:
 * `withProfileScope` only ever needs `.execute()` (to build query
 * objects) and `.batch()` (to "run" them) — everything else about a real
 * Drizzle/Neon handle is irrelevant to this module's own logic, which is
 * what's actually under test here (`@vercel/blob` is mocked separately
 * above; a real database is neither available nor needed for these).
 */
function buildFakeDb(batchResultsQueue: unknown[][]) {
  const queue = [...batchResultsQueue];
  const fakeDb = {
    execute: vi.fn((query: unknown) => ({ __marker: "execute_call", query })),
    batch: vi.fn(async () => {
      const next = queue.shift();
      if (!next) throw new Error("buildFakeDb: no more queued batch() results — test wired more DB round trips than expected.");
      return next;
    }),
  };
  return fakeDb as unknown as Db;
}

function selectResult(row: { id: string; photo_blob_key: string | null } | null) {
  return { rows: row ? [row] : [] };
}

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  // `getEnv()` validates the WHOLE config schema, not just this module's
  // own field — the baseline vars `vitest.setup.mts` seeds don't include
  // every one (other suites set the rest themselves as needed); set them
  // here too so a `getEnv()` call from this module doesn't fail on an
  // unrelated field.
  process.env.GOOGLE_CLIENT_ID ??= "test-client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";
  process.env.ACCOUNT_ID_HASH_PEPPER ??= "test-pepper-at-least-32-characters-long";
  __resetEnvCacheForTests();
  vi.mocked(put).mockReset();
  vi.mocked(get).mockReset();
  vi.mocked(del).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  __resetEnvCacheForTests();
});

describe("uploadMedicationPhoto", () => {
  it("rejects an invalid file before ever touching the database or blob storage", async () => {
    const db = buildFakeDb([]);
    await expect(
      uploadMedicationPhoto(
        { profileId: PROFILE_ID, userMedicationId: MEDICATION_ID, file: { bytes: JPEG_BYTES, contentType: "application/pdf", size: 4 } },
        db,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(put).not.toHaveBeenCalled();
  });

  it("throws NotFoundError (never AuthorizationError) when the medication isn't owned by this profile / doesn't exist", async () => {
    const db = buildFakeDb([
      ["set_config_result", selectResult(null)], // ownership select finds nothing
    ]);
    await expect(
      uploadMedicationPhoto(
        { profileId: PROFILE_ID, userMedicationId: MEDICATION_ID, file: { bytes: JPEG_BYTES, contentType: "image/jpeg", size: JPEG_BYTES.length } },
        db,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(put).not.toHaveBeenCalled();
  });

  it("fails closed with ConfigError when BLOB_READ_WRITE_TOKEN isn't set, even for an otherwise-owned medication", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    __resetEnvCacheForTests();
    const db = buildFakeDb([["set_config_result", selectResult({ id: MEDICATION_ID, photo_blob_key: null })]]);
    await expect(
      uploadMedicationPhoto(
        { profileId: PROFILE_ID, userMedicationId: MEDICATION_ID, file: { bytes: JPEG_BYTES, contentType: "image/jpeg", size: JPEG_BYTES.length } },
        db,
      ),
    ).rejects.toBeInstanceOf(ConfigError);
    expect(put).not.toHaveBeenCalled();
  });

  it("uploads as a PRIVATE blob and best-effort deletes the previous photo's blob afterward", async () => {
    const db = buildFakeDb([
      ["set_config_result", selectResult({ id: MEDICATION_ID, photo_blob_key: "medication-photos/old-key" })],
      ["set_config_result", { rowCount: 1 }],
    ]);
    vi.mocked(put).mockResolvedValue({
      url: "https://example.blob.vercel-storage.com/new-key",
      downloadUrl: "https://example.blob.vercel-storage.com/new-key?download=1",
      pathname: "medication-photos/new-key",
      contentType: "image/jpeg",
      contentDisposition: "inline",
      etag: "etag-1",
    } as never);

    await uploadMedicationPhoto(
      { profileId: PROFILE_ID, userMedicationId: MEDICATION_ID, file: { bytes: JPEG_BYTES, contentType: "image/jpeg", size: JPEG_BYTES.length } },
      db,
    );

    expect(put).toHaveBeenCalledTimes(1);
    const [pathname, , options] = vi.mocked(put).mock.calls[0];
    expect(pathname).toBe(`medication-photos/${PROFILE_ID}/${MEDICATION_ID}`);
    expect(options).toMatchObject({ access: "private", addRandomSuffix: true, contentType: "image/jpeg" });

    expect(del).toHaveBeenCalledWith("medication-photos/old-key");
  });

  it("does not throw if cleaning up the PREVIOUS blob fails — the new photo already saved successfully", async () => {
    const db = buildFakeDb([
      ["set_config_result", selectResult({ id: MEDICATION_ID, photo_blob_key: "medication-photos/old-key" })],
      ["set_config_result", { rowCount: 1 }],
    ]);
    vi.mocked(put).mockResolvedValue({ pathname: "medication-photos/new-key" } as never);
    vi.mocked(del).mockRejectedValueOnce(new Error("transient blob outage"));

    await expect(
      uploadMedicationPhoto(
        { profileId: PROFILE_ID, userMedicationId: MEDICATION_ID, file: { bytes: JPEG_BYTES, contentType: "image/jpeg", size: JPEG_BYTES.length } },
        db,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("getMedicationPhoto", () => {
  it("throws NotFoundError when the medication isn't owned by this profile / doesn't exist", async () => {
    const db = buildFakeDb([["set_config_result", selectResult(null)]]);
    await expect(getMedicationPhoto({ profileId: PROFILE_ID, userMedicationId: MEDICATION_ID }, db)).rejects.toBeInstanceOf(NotFoundError);
    expect(get).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the medication is owned but has no photo attached", async () => {
    const db = buildFakeDb([["set_config_result", selectResult({ id: MEDICATION_ID, photo_blob_key: null })]]);
    await expect(getMedicationPhoto({ profileId: PROFILE_ID, userMedicationId: MEDICATION_ID }, db)).rejects.toBeInstanceOf(NotFoundError);
    expect(get).not.toHaveBeenCalled();
  });

  it("self-heals a stale DB pointer (blob genuinely missing) by clearing it, then reports NotFoundError", async () => {
    const db = buildFakeDb([
      ["set_config_result", selectResult({ id: MEDICATION_ID, photo_blob_key: "medication-photos/gone" })],
      ["set_config_result", { rowCount: 1 }], // the self-heal UPDATE
    ]);
    vi.mocked(get).mockResolvedValue(null as never);

    await expect(getMedicationPhoto({ profileId: PROFILE_ID, userMedicationId: MEDICATION_ID }, db)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("streams the real photo back on the happy path", async () => {
    const db = buildFakeDb([["set_config_result", selectResult({ id: MEDICATION_ID, photo_blob_key: "medication-photos/real" })]]);
    const fakeStream = {} as ReadableStream<Uint8Array>;
    vi.mocked(get).mockResolvedValue({
      statusCode: 200,
      stream: fakeStream,
      headers: new Headers(),
      blob: { contentType: "image/jpeg", size: 1234, etag: "abc", url: "u", downloadUrl: "u", pathname: "p", contentDisposition: "inline", uploadedAt: new Date() },
    } as never);

    const result = await getMedicationPhoto({ profileId: PROFILE_ID, userMedicationId: MEDICATION_ID }, db);
    expect(result.stream).toBe(fakeStream);
    expect(result.contentType).toBe("image/jpeg");
    expect(result.size).toBe(1234);
    expect(result.etag).toBe("abc");
    expect(get).toHaveBeenCalledWith("medication-photos/real", { access: "private" });
  });
});

describe("deleteMedicationPhoto", () => {
  it("is an idempotent no-op when there's no photo to remove", async () => {
    const db = buildFakeDb([["set_config_result", selectResult({ id: MEDICATION_ID, photo_blob_key: null })]]);
    await deleteMedicationPhoto({ profileId: PROFILE_ID, userMedicationId: MEDICATION_ID }, db);
    expect(del).not.toHaveBeenCalled();
  });

  it("clears the DB pointer and deletes the blob on the happy path", async () => {
    const db = buildFakeDb([
      ["set_config_result", selectResult({ id: MEDICATION_ID, photo_blob_key: "medication-photos/real" })],
      ["set_config_result", { rowCount: 1 }],
    ]);
    await deleteMedicationPhoto({ profileId: PROFILE_ID, userMedicationId: MEDICATION_ID }, db);
    expect(del).toHaveBeenCalledWith("medication-photos/real");
  });

  it("throws NotFoundError for a medication that isn't owned by this profile / doesn't exist", async () => {
    const db = buildFakeDb([["set_config_result", selectResult(null)]]);
    await expect(deleteMedicationPhoto({ profileId: PROFILE_ID, userMedicationId: MEDICATION_ID }, db)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("collectMedicationPhotoBlobKeysForProfile", () => {
  it("maps DB rows to a plain array of blob keys", async () => {
    const db = buildFakeDb([["set_config_result", { rows: [{ photo_blob_key: "a" }, { photo_blob_key: "b" }] }]]);
    await expect(collectMedicationPhotoBlobKeysForProfile(PROFILE_ID, db)).resolves.toEqual(["a", "b"]);
  });

  it("returns an empty array when nothing has a photo (the common case)", async () => {
    const db = buildFakeDb([["set_config_result", { rows: [] }]]);
    await expect(collectMedicationPhotoBlobKeysForProfile(PROFILE_ID, db)).resolves.toEqual([]);
  });
});
