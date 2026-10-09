// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { MedTrackingDexie, __setClientDbForTests } from "@/lib/db-client/dexie";
import { clearSnapshots } from "@/lib/client-cache/snapshot";
import { clearCachedProfile } from "@/lib/auth/client/use-current-profile";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

const hydrate = vi.fn(async () => {});
vi.mock("@/lib/sync/client/hydrate-local-data", () => ({ hydrateLocalDataFromServer: () => hydrate() }));

const { useMedicationsList, __resetCatchUpForTests } = await import("@/components/medications/use-medications-list");
const { useDisplayNames, __clearResolvedNamesForTests } = await import("@/lib/medications/client/use-display-names");

const PROFILE_ID = "profile-1";
let db: MedTrackingDexie;

function med(id: string, customName: string): UserMedicationRecord {
  return {
    id,
    profileId: PROFILE_ID,
    catalogProductId: null,
    customName,
    customForm: "tablet",
    customStrengthValue: null,
    customStrengthUnit: null,
    treatmentState: "active",
    inventoryUnit: "tablet",
    lowStockThresholdValue: null,
    expiryWarningDays: 30,
    notes: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    version: 1,
    deletedAt: null,
    clientMutationId: `cm-${id}`,
    syncState: "synced",
  };
}

async function flush(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

beforeEach(async () => {
  db = new MedTrackingDexie(`test-medications-list-${crypto.randomUUID()}`);
  __setClientDbForTests(db);
  clearSnapshots();
  __resetCatchUpForTests();
  __clearResolvedNamesForTests();
  hydrate.mockClear();
  await db.userMedication.bulkPut([med("a", "Metformin"), med("b", "Vitamin D")]);
});

afterEach(async () => {
  cleanup();
  __setClientDbForTests(undefined);
  await db.delete();
});

describe("screens remember what they showed (2026-10-09)", () => {
  it("a screen opened again is ready on its first frame — no 'Φόρτωση…'", async () => {
    const first = renderHook(() => useMedicationsList(PROFILE_ID));
    expect(first.result.current.status).toBe("loading");
    await flush();
    expect(first.result.current.medications).toHaveLength(2);
    first.unmount();

    const again = renderHook(() => useMedicationsList(PROFILE_ID));
    expect(again.result.current.status).toBe("ready");
    expect(again.result.current.medications.map((m) => m.id).sort()).toEqual(["a", "b"]);
  });

  it("an unchanged re-read keeps the same array, so names and schedules keyed on it don't recompute", async () => {
    const first = renderHook(() => useMedicationsList(PROFILE_ID));
    await flush();
    const shown = first.result.current.medications;
    first.unmount();

    const again = renderHook(() => useMedicationsList(PROFILE_ID));
    await flush();
    expect(again.result.current.medications).toBe(shown);
  });

  it("a change made meanwhile still shows up after the instant first frame", async () => {
    const first = renderHook(() => useMedicationsList(PROFILE_ID));
    await flush();
    first.unmount();
    await db.userMedication.put(med("c", "Omeprazole"));

    const again = renderHook(() => useMedicationsList(PROFILE_ID));
    expect(again.result.current.medications).toHaveLength(2);
    await flush();
    expect(again.result.current.medications).toHaveLength(3);
  });

  it("asks the server at most once a minute, not on every screen", async () => {
    for (let i = 0; i < 3; i++) {
      const view = renderHook(() => useMedicationsList(PROFILE_ID));
      await flush();
      view.unmount();
    }
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it("names resolved once are there on the next visit's first frame", async () => {
    const meds = [med("a", "Metformin")];
    const first = renderHook(() => useDisplayNames(meds));
    await flush();
    expect(first.result.current.get("a")).toBe("Metformin");
    first.unmount();

    const again = renderHook(() => useDisplayNames(meds));
    expect(again.result.current.get("a")).toBe("Metformin");
  });

  it("signing out forgets what the screens showed", async () => {
    const first = renderHook(() => useMedicationsList(PROFILE_ID));
    await flush();
    first.unmount();

    clearCachedProfile();

    const again = renderHook(() => useMedicationsList(PROFILE_ID));
    expect(again.result.current.status).toBe("loading");
  });
});
