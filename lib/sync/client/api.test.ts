// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postMutations, pullChanges, SyncApiError } from "@/lib/sync/client/api";
import { onSessionExpired } from "@/lib/auth/client/session-expired-signal";
import { getCachedProfileId } from "@/lib/auth/client/use-current-profile";

const CACHED_PROFILE_KEY = "medtrack:last-known-profile";

function seedCachedProfile(): void {
  localStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify({ profileId: "profile-1", accountId: "account-1" }));
}

function fakeResponse(status: number): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve({}) } as Response;
}

beforeEach(() => {
  seedCachedProfile();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("postMutations / pullChanges — session-expiry detection", () => {
  it("clears the cached profile and fires onSessionExpired on a 401", async () => {
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(401));

    await expect(postMutations([], fetchImpl)).rejects.toThrow(SyncApiError);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getCachedProfileId()).toBeNull();
    unsubscribe();
  });

  it("clears the cached profile and fires onSessionExpired on a 403", async () => {
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(403));

    await expect(pullChanges(0, fetchImpl)).rejects.toThrow(SyncApiError);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getCachedProfileId()).toBeNull();
    unsubscribe();
  });

  it("does NOT fire onSessionExpired or clear the cached profile on a plain 500", async () => {
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(500));

    await expect(postMutations([], fetchImpl)).rejects.toThrow(SyncApiError);

    expect(listener).not.toHaveBeenCalled();
    expect(getCachedProfileId()).toBe("profile-1");
    unsubscribe();
  });

  it("does NOT fire onSessionExpired on success", async () => {
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ results: [] }) } as Response);

    await postMutations([], fetchImpl);

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
