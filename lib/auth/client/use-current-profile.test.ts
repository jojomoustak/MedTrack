// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { useCurrentProfile } from "@/lib/auth/client/use-current-profile";

const PROFILE = { profileId: "profile-1", accountId: "account-1" };

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useCurrentProfile — offline session continuity (found via live-device testing 2026-08-29)", () => {
  it("a successful /api/me caches the profile for later offline fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(PROFILE), { status: 200 })),
    );

    const { result } = renderHook(() => useCurrentProfile());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(JSON.parse(localStorage.getItem("medtrack:last-known-profile")!)).toEqual(PROFILE);
  });

  it("a network error (offline) falls back to the last-known profile instead of signing the user out", async () => {
    localStorage.setItem("medtrack:last-known-profile", JSON.stringify(PROFILE));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const { result } = renderHook(() => useCurrentProfile());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current).toMatchObject({ status: "ready", ...PROFILE });
  });

  it("a network error with no prior cached profile still shows signed-out (nothing to fall back to)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const { result } = renderHook(() => useCurrentProfile());
    await waitFor(() => expect(result.current.status).toBe("signed-out"));
  });

  it("an explicit 401 is a real sign-out, even with a cached profile present", async () => {
    localStorage.setItem("medtrack:last-known-profile", JSON.stringify(PROFILE));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const { result } = renderHook(() => useCurrentProfile());
    await waitFor(() => expect(result.current.status).toBe("signed-out"));

    expect(localStorage.getItem("medtrack:last-known-profile")).toBeNull();
  });

  it("a 500 (not an auth failure) also falls back to the cached profile rather than signing out", async () => {
    localStorage.setItem("medtrack:last-known-profile", JSON.stringify(PROFILE));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    const { result } = renderHook(() => useCurrentProfile());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current).toMatchObject({ status: "ready", ...PROFILE });
  });
});
