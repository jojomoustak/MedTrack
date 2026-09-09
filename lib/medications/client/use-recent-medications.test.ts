// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook, cleanup, waitFor } from "@testing-library/react";
import { useRecentMedications } from "@/lib/medications/client/use-recent-medications";
import { DexieRecentlyUsedEventRepository } from "@/lib/db-client/recently-used-event-repository";
import { MedTrackingDexie, __setClientDbForTests } from "@/lib/db-client/dexie";

const PROFILE_ID = "profile-1";

let db: MedTrackingDexie;

beforeEach(() => {
  db = new MedTrackingDexie(`test-use-recent-${crypto.randomUUID()}`);
  __setClientDbForTests(db);
});

afterEach(async () => {
  cleanup();
  __setClientDbForTests(undefined);
  await db.delete();
});

describe("useRecentMedications", () => {
  it("returns nothing when no interactions have been recorded", async () => {
    const { result } = renderHook(() => useRecentMedications(PROFILE_ID));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.recentMedicationIds).toEqual([]);
  });

  it("orders medications most-recently-interacted-with first", async () => {
    const repo = new DexieRecentlyUsedEventRepository(db);
    await repo.record({ id: crypto.randomUUID(), profileId: PROFILE_ID, userMedicationId: "med-a", interactionType: "viewed", occurredAt: "2026-01-01T10:00:00.000Z" });
    await repo.record({ id: crypto.randomUUID(), profileId: PROFILE_ID, userMedicationId: "med-b", interactionType: "viewed", occurredAt: "2026-01-01T11:00:00.000Z" });

    const { result } = renderHook(() => useRecentMedications(PROFILE_ID));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.recentMedicationIds).toEqual(["med-b", "med-a"]);
  });

  it("collapses multiple events for the same medication to one entry, at its most recent position", async () => {
    const repo = new DexieRecentlyUsedEventRepository(db);
    await repo.record({ id: crypto.randomUUID(), profileId: PROFILE_ID, userMedicationId: "med-a", interactionType: "viewed", occurredAt: "2026-01-01T10:00:00.000Z" });
    await repo.record({ id: crypto.randomUUID(), profileId: PROFILE_ID, userMedicationId: "med-b", interactionType: "viewed", occurredAt: "2026-01-01T11:00:00.000Z" });
    await repo.record({ id: crypto.randomUUID(), profileId: PROFILE_ID, userMedicationId: "med-a", interactionType: "marked_taken", occurredAt: "2026-01-01T12:00:00.000Z" });

    const { result } = renderHook(() => useRecentMedications(PROFILE_ID));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.recentMedicationIds).toEqual(["med-a", "med-b"]);
  });

  it("scopes to the given profile only", async () => {
    const repo = new DexieRecentlyUsedEventRepository(db);
    await repo.record({ id: crypto.randomUUID(), profileId: PROFILE_ID, userMedicationId: "med-a", interactionType: "viewed", occurredAt: new Date().toISOString() });
    await repo.record({ id: crypto.randomUUID(), profileId: "other-profile", userMedicationId: "med-x", interactionType: "viewed", occurredAt: new Date().toISOString() });

    const { result } = renderHook(() => useRecentMedications(PROFILE_ID));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.recentMedicationIds).toEqual(["med-a"]);
  });
});
