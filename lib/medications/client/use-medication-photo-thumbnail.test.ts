// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { MedTrackingDexie, __setClientDbForTests } from "@/lib/db-client/dexie";
import { DexiePhotoOutboxRepository } from "@/lib/medications/client/photo-outbox-repository";
import { notifyProfileCleared } from "@/lib/auth/client/profile-cleared-signal";
import {
  __resetPhotoChecksForTests,
  preloadPhotoThumbnails,
  removeLocalPhotoThumbnail,
  setLocalPhotoThumbnail,
  syncPhotoThumbnails,
  useMedicationPhotoThumbnail,
} from "@/lib/medications/client/use-medication-photo-thumbnail";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";
const VA = "0123456789abcdef";
const VB = "fedcba9876543210";
const JPEG_B64 = btoa("thumbnail-bytes");

let db: MedTrackingDexie;
let fetchMock: ReturnType<typeof vi.fn>;

function thumbnailsResponse(body: { photos: { userMedicationId: string; version: string; data?: string }[]; more?: boolean }) {
  return new Response(JSON.stringify({ more: false, ...body }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function sentKnown(call: number): Record<string, string> {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string).known;
}

beforeEach(() => {
  db = new MedTrackingDexie(`test-photo-thumbs-${crypto.randomUUID()}`);
  __setClientDbForTests(db);
  __resetPhotoChecksForTests();
  let n = 0;
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => `blob:fake-${n++}`), revokeObjectURL: vi.fn() });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  __setClientDbForTests(undefined);
  await db.delete();
});

describe("medication avatars (2026-10-15: thumbnails from one request, kept on the phone)", () => {
  it("a stored thumbnail is in the avatar's very first frame after the start-up preload, with no network", async () => {
    await db.photoThumbnail.put({ userMedicationId: A, version: VA, blob: new Blob(["t"]), updatedAt: "now" });
    await preloadPhotoThumbnails(db);

    const { result } = renderHook(() => useMedicationPhotoThumbnail(A));

    expect(result.current.status).toBe("present");
    expect(result.current.url).toMatch(/^blob:/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a medication with no stored thumbnail shows no photo once the preload has run (and never asks the server itself)", async () => {
    const { result } = renderHook(() => useMedicationPhotoThumbnail(B));
    expect(result.current.status).toBe("checking");
    await act(async () => preloadPhotoThumbnails(db));
    expect(result.current).toEqual({ status: "absent", url: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("one request brings every missing thumbnail; avatars on screen update", async () => {
    await preloadPhotoThumbnails(db);
    fetchMock.mockResolvedValueOnce(thumbnailsResponse({ photos: [{ userMedicationId: A, version: VA, data: JPEG_B64 }, { userMedicationId: B, version: VB, data: JPEG_B64 }] }));
    const a = renderHook(() => useMedicationPhotoThumbnail(A));

    await act(async () => syncPhotoThumbnails({ db }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/medications/photo-thumbnails");
    expect(a.result.current.status).toBe("present");
    expect((await db.photoThumbnail.get(B))?.version).toBe(VB);
  });

  it("tells the server which versions it has, so unchanged thumbnails aren't sent again", async () => {
    await db.photoThumbnail.put({ userMedicationId: A, version: VA, blob: new Blob(["t"]), updatedAt: "now" });
    fetchMock.mockResolvedValueOnce(thumbnailsResponse({ photos: [{ userMedicationId: A, version: VA }] }));

    await syncPhotoThumbnails({ db });

    expect(sentKnown(0)).toEqual({ [A]: VA });
    expect(await db.photoThumbnail.count()).toBe(1);
  });

  it("keeps asking while the server says there are more", async () => {
    fetchMock
      .mockResolvedValueOnce(thumbnailsResponse({ photos: [{ userMedicationId: A, version: VA, data: JPEG_B64 }, { userMedicationId: B, version: VB }], more: true }))
      .mockResolvedValueOnce(thumbnailsResponse({ photos: [{ userMedicationId: A, version: VA }, { userMedicationId: B, version: VB, data: JPEG_B64 }] }));

    await syncPhotoThumbnails({ db });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentKnown(1)).toEqual({ [A]: VA });
    expect(await db.photoThumbnail.count()).toBe(2);
  });

  it("forgets a thumbnail whose photo is gone (removed on another device)", async () => {
    await db.photoThumbnail.bulkPut([
      { userMedicationId: A, version: VA, blob: new Blob(["t"]), updatedAt: "now" },
      { userMedicationId: B, version: VB, blob: new Blob(["t"]), updatedAt: "now" },
    ]);
    await preloadPhotoThumbnails(db);
    const b = renderHook(() => useMedicationPhotoThumbnail(B));
    fetchMock.mockResolvedValueOnce(thumbnailsResponse({ photos: [{ userMedicationId: A, version: VA }] }));

    await act(async () => syncPhotoThumbnails({ db }));

    expect(await db.photoThumbnail.get(B)).toBeUndefined();
    expect(b.result.current.status).toBe("absent");
  });

  it("a photo change still waiting to upload from this phone is never undone by the server's older answer", async () => {
    const outbox = new DexiePhotoOutboxRepository(db);
    // C: a new photo queued offline (the server doesn't have it yet).
    await setLocalPhotoThumbnail(C, new Blob(["new"]), db);
    await outbox.enqueue({ userMedicationId: C, operation: "upload", blob: new Blob(["photo"]), contentType: "image/jpeg" });
    // B: a removal queued offline (the server still has the photo).
    await removeLocalPhotoThumbnail(B, db);
    await outbox.enqueue({ userMedicationId: B, operation: "delete" });
    fetchMock.mockResolvedValueOnce(thumbnailsResponse({ photos: [{ userMedicationId: B, version: VB, data: JPEG_B64 }] }));

    await syncPhotoThumbnails({ db });

    expect(await db.photoThumbnail.get(C)).toBeDefined();
    expect(await db.photoThumbnail.get(B)).toBeUndefined();
  });

  it("a failed request changes nothing", async () => {
    await db.photoThumbnail.put({ userMedicationId: A, version: VA, blob: new Blob(["t"]), updatedAt: "now" });
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    await syncPhotoThumbnails({ db });
    expect(await db.photoThumbnail.count()).toBe(1);
  });

  it("a sync still running at sign-out writes nothing back for the profile that left", async () => {
    let answer: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const running = syncPhotoThumbnails({ db });
    await new Promise((r) => setTimeout(r, 20));

    act(() => notifyProfileCleared());
    answer(thumbnailsResponse({ photos: [{ userMedicationId: A, version: VA, data: JPEG_B64 }] }));
    await running;

    expect(await db.photoThumbnail.count()).toBe(0);
  });

  it("a photo removed on this phone while a sync runs doesn't come back from that sync's older answer", async () => {
    await db.photoThumbnail.put({ userMedicationId: A, version: null, blob: new Blob(["t"]), updatedAt: "now" });
    let answer: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve))).mockResolvedValue(thumbnailsResponse({ photos: [] }));
    const running = syncPhotoThumbnails({ db });
    await new Promise((r) => setTimeout(r, 20));

    await removeLocalPhotoThumbnail(A, db);
    answer(thumbnailsResponse({ photos: [{ userMedicationId: A, version: VA, data: JPEG_B64 }] }));
    await running;

    expect(await db.photoThumbnail.get(A)).toBeUndefined();
  });

  it("asked again while running (a photo was just uploaded), it runs once more afterwards", async () => {
    let answer: (r: Response) => void = () => {};
    fetchMock
      .mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)))
      .mockResolvedValueOnce(thumbnailsResponse({ photos: [{ userMedicationId: B, version: VB, data: JPEG_B64 }] }));
    const first = syncPhotoThumbnails({ db });
    await new Promise((r) => setTimeout(r, 20));
    const second = syncPhotoThumbnails({ db });
    answer(thumbnailsResponse({ photos: [] }));
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await db.photoThumbnail.get(B))?.version).toBe(VB);
  });

  it("stops when the server says 'more' but sends nothing new (thumbnails it can't make right now)", async () => {
    fetchMock.mockResolvedValue(thumbnailsResponse({ photos: [{ userMedicationId: A, version: VA }], more: true }));
    await syncPhotoThumbnails({ db });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("signing out forgets the thumbnails held in memory", async () => {
    await db.photoThumbnail.put({ userMedicationId: A, version: VA, blob: new Blob(["t"]), updatedAt: "now" });
    await preloadPhotoThumbnails(db);
    const a = renderHook(() => useMedicationPhotoThumbnail(A));
    expect(a.result.current.status).toBe("present");

    act(() => notifyProfileCleared());

    expect(a.result.current).toEqual({ status: "checking", url: null });
  });
});
