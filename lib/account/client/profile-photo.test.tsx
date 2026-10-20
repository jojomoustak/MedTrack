// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useProfilePhoto } from "@/lib/account/client/profile-photo";
import { CACHED_PROFILE_PHOTO_KEY, clearCachedProfile } from "@/lib/auth/client/use-current-profile";

const PROFILE = "p-1";
const cached = (dataUrl = "data:image/jpeg;base64,AAAA", etag = '"e1"') => localStorage.setItem(CACHED_PROFILE_PHOTO_KEY, JSON.stringify({ profileId: PROFILE, etag, dataUrl }));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("medtrack:last-known-profile", JSON.stringify({ profileId: PROFILE, accountId: "a-1" }));
});
afterEach(() => vi.restoreAllMocks());

const response = (status: number, body: BodyInit | null = null, headers: Record<string, string> = {}) => new Response(body, { status, headers });

describe("useProfilePhoto", () => {
  it("shows the phone's copy at once, and keeps it when the server says it's current", async () => {
    cached();
    const fetchImpl = vi.fn().mockResolvedValue(response(304));
    const { result } = renderHook(() => useProfilePhoto(PROFILE, fetchImpl));

    expect(result.current.src).toBe("data:image/jpeg;base64,AAAA");
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({ "If-None-Match": '"e1"' });
    expect(result.current.src).toBe("data:image/jpeg;base64,AAAA");
  });

  it("drops the copy when the photo was removed elsewhere", async () => {
    cached();
    const fetchImpl = vi.fn().mockResolvedValue(response(404));
    const { result } = renderHook(() => useProfilePhoto(PROFILE, fetchImpl));

    await waitFor(() => expect(result.current.src).toBeNull());
    expect(localStorage.getItem(CACHED_PROFILE_PHOTO_KEY)).toBeNull();
  });

  it("keeps showing the copy offline", async () => {
    cached();
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useProfilePhoto(PROFILE, fetchImpl));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(result.current.src).toBe("data:image/jpeg;base64,AAAA");
  });

  it("changing it offline says the network is needed", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(404)).mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useProfilePhoto(PROFILE, fetchImpl));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    await act(() => result.current.upload(new File(["x"], "me.jpg", { type: "image/jpeg" })));
    expect(result.current.error).toBe("Χρειάζεται σύνδεση στο διαδίκτυο για να αλλάξει η φωτογραφία.");
    expect(result.current.busy).toBe(false);
  });

  it("removing it clears the phone's copy too", async () => {
    cached();
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(304)).mockResolvedValueOnce(response(200, JSON.stringify({ deleted: true })));
    const { result } = renderHook(() => useProfilePhoto(PROFILE, fetchImpl));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    await act(() => result.current.remove());
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
    expect(result.current.src).toBeNull();
    expect(localStorage.getItem(CACHED_PROFILE_PHOTO_KEY)).toBeNull();
  });

  it("another profile's copy is never shown", () => {
    localStorage.setItem(CACHED_PROFILE_PHOTO_KEY, JSON.stringify({ profileId: "someone-else", etag: null, dataUrl: "data:x" }));
    const { result } = renderHook(() => useProfilePhoto(PROFILE, vi.fn().mockResolvedValue(response(404))));
    expect(result.current.src).toBeNull();
  });

  it("a copy that isn't image data is ignored", () => {
    localStorage.setItem(CACHED_PROFILE_PHOTO_KEY, JSON.stringify({ profileId: PROFILE, etag: null, dataUrl: "https://elsewhere.example/x.png" }));
    const { result } = renderHook(() => useProfilePhoto(PROFILE, vi.fn().mockResolvedValue(response(304))));
    expect(result.current.src).toBeNull();
  });

  it("a photo arriving after sign-out isn't kept", async () => {
    localStorage.removeItem("medtrack:last-known-profile"); // signed out while the request was in flight
    const fetchImpl = vi.fn().mockResolvedValue(response(200, new Blob(["x"], { type: "image/jpeg" }), { ETag: '"e2"' }));
    renderHook(() => useProfilePhoto(PROFILE, fetchImpl));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(localStorage.getItem(CACHED_PROFILE_PHOTO_KEY)).toBeNull();
  });

  it("signing out clears it", () => {
    cached();
    clearCachedProfile();
    expect(localStorage.getItem(CACHED_PROFILE_PHOTO_KEY)).toBeNull();
  });
});
