// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { MedTrackingDexie, __setClientDbForTests } from "@/lib/db-client/dexie";
import { DexiePhotoCacheRepository } from "@/lib/medications/client/photo-cache-repository";
import { DexiePhotoOutboxRepository } from "@/lib/medications/client/photo-outbox-repository";

const THUMB = new Blob(["thumb"], { type: "image/jpeg" });
const makePhotoThumbnail = vi.fn(async () => THUMB);
vi.mock("@/lib/medications/client/photo-thumbnail", () => ({ makePhotoThumbnail: () => makePhotoThumbnail() }));

const { useMedicationPhotoThumbnail, __resetPhotoChecksForTests } = await import("@/lib/medications/client/use-medication-photo-thumbnail");

const MED = "med-1";
const FULL = new Blob(["a full-size phone photo"], { type: "image/jpeg" });
let db: MedTrackingDexie;
let urlFor: Map<string, Blob>;
let fetchMock: ReturnType<typeof vi.fn>;

async function flush(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

beforeEach(() => {
  db = new MedTrackingDexie(`test-photo-thumb-${crypto.randomUUID()}`);
  __setClientDbForTests(db);
  __resetPhotoChecksForTests();
  makePhotoThumbnail.mockClear();
  urlFor = new Map();
  let n = 0;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn((blob: Blob) => {
      const url = `blob:fake-${n++}`;
      urlFor.set(url, blob);
      return url;
    }),
    revokeObjectURL: vi.fn(),
  });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await flush(3); // let background cache writes (touch) land before the database goes
  cleanup();
  vi.unstubAllGlobals();
  __setClientDbForTests(undefined);
  await db.delete();
});

describe("medication avatars draw a small thumbnail, not the full photo (2026-10-09)", () => {
  it("a photo cached before thumbnails existed gets one made once, and the avatar shows it", async () => {
    await new DexiePhotoCacheRepository(db).put({ userMedicationId: MED, blob: FULL, contentType: "image/jpeg", etag: '"v1"' });
    fetchMock.mockResolvedValue(new Response(null, { status: 304 }));

    const { result } = renderHook(() => useMedicationPhotoThumbnail(MED));
    await flush();

    expect(result.current.status).toBe("present");
    expect(urlFor.get(result.current.url!)).toBe(THUMB);
    expect((await new DexiePhotoCacheRepository(db).get(MED))?.thumbnail).toBeTruthy();
  });

  it("checks with the cached version, so an unchanged photo isn't downloaded again", async () => {
    await new DexiePhotoCacheRepository(db).put({ userMedicationId: MED, blob: FULL, contentType: "image/jpeg", thumbnail: THUMB, etag: '"v1"' });
    fetchMock.mockResolvedValue(new Response(null, { status: 304 }));

    const cachedAt = (await new DexiePhotoCacheRepository(db).get(MED))?.cachedAt;
    renderHook(() => useMedicationPhotoThumbnail(MED));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ "If-None-Match": '"v1"' });
    // Nothing re-stored: the cached copy is the same one.
    expect((await new DexiePhotoCacheRepository(db).get(MED))?.cachedAt).toBe(cachedAt);
  });

  it("a screen opened again shows the photo on its first frame, without asking the server", async () => {
    await new DexiePhotoCacheRepository(db).put({ userMedicationId: MED, blob: FULL, contentType: "image/jpeg", thumbnail: THUMB, etag: '"v1"' });
    fetchMock.mockResolvedValue(new Response(null, { status: 304 }));
    const first = renderHook(() => useMedicationPhotoThumbnail(MED));
    await flush();
    const shown = first.result.current.url;
    first.unmount();

    const again = renderHook(() => useMedicationPhotoThumbnail(MED));
    expect(again.result.current.status).toBe("present");
    expect(again.result.current.url).toBe(shown);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never lets the server's answer overwrite a photo still waiting to upload", async () => {
    await new DexiePhotoCacheRepository(db).put({ userMedicationId: MED, blob: FULL, contentType: "image/jpeg", thumbnail: THUMB });
    await new DexiePhotoOutboxRepository(db).enqueue({ userMedicationId: MED, operation: "upload", blob: FULL, contentType: "image/jpeg" });

    const { result } = renderHook(() => useMedicationPhotoThumbnail(MED));
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("present");
  });
});
