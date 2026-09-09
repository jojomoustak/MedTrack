// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import { useFavoriteMedications } from "@/lib/medications/client/use-favorite-medications";
import { DexieFavoriteRepository } from "@/lib/db-client/favorite-repository";
import { MedTrackingDexie, __setClientDbForTests } from "@/lib/db-client/dexie";

const PROFILE_ID = "profile-1";

let db: MedTrackingDexie;

beforeEach(() => {
  db = new MedTrackingDexie(`test-use-favorites-${crypto.randomUUID()}`);
  __setClientDbForTests(db);
});

afterEach(async () => {
  cleanup();
  __setClientDbForTests(undefined);
  await db.delete();
});

describe("useFavoriteMedications", () => {
  it("loads already-favorited medications on mount", async () => {
    const repo = new DexieFavoriteRepository(db);
    await repo.toggle(PROFILE_ID, "med-1", crypto.randomUUID());

    const { result } = renderHook(() => useFavoriteMedications(PROFILE_ID));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.favoriteIds.has("med-1")).toBe(true);
  });

  it("toggleFavorite optimistically flips state immediately", async () => {
    const { result } = renderHook(() => useFavoriteMedications(PROFILE_ID));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.toggleFavorite("med-1"));

    expect(result.current.favoriteIds.has("med-1")).toBe(true);
  });

  it("toggleFavorite persists to the repository", async () => {
    const { result } = renderHook(() => useFavoriteMedications(PROFILE_ID));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.toggleFavorite("med-1"));

    await waitFor(async () => {
      const repo = new DexieFavoriteRepository(db);
      const stored = await repo.get(PROFILE_ID, "med-1");
      expect(stored?.removedAt).toBeNull();
    });
  });

  it("toggling twice removes it from favoriteIds", async () => {
    const { result } = renderHook(() => useFavoriteMedications(PROFILE_ID));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.toggleFavorite("med-1"));
    expect(result.current.favoriteIds.has("med-1")).toBe(true);

    act(() => result.current.toggleFavorite("med-1"));
    expect(result.current.favoriteIds.has("med-1")).toBe(false);
  });
});
