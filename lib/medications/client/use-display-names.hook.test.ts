// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useDisplayNames, __clearResolvedNamesForTests } from "@/lib/medications/client/use-display-names";
import { __resetCatalogProductRequestsForTests } from "@/lib/catalog/client/cache-missing-catalog-products";
import { MedTrackingDexie, __setClientDbForTests } from "@/lib/db-client/dexie";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

const PRODUCT_ID = "44444444-4444-4444-8444-444444444444";
const PLACEHOLDER = "Φάρμακο από κατάλογο";

const med: UserMedicationRecord = {
  id: "med-1",
  profileId: "profile-1",
  catalogProductId: PRODUCT_ID,
  customName: null,
  customForm: null,
  customStrengthValue: null,
  customStrengthUnit: null,
  treatmentState: "active",
  inventoryUnit: "capsule",
  lowStockThresholdValue: null,
  expiryWarningDays: 30,
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: 1,
  deletedAt: null,
  clientMutationId: "cmid-1",
  syncState: "synced",
};
const MEDS = [med];

let db: MedTrackingDexie;

beforeEach(() => {
  // A device right after "Clear data": the medication is back, the catalog isn't.
  db = new MedTrackingDexie(`test-display-names-${crypto.randomUUID()}`);
  __setClientDbForTests(db);
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  __clearResolvedNamesForTests();
  __resetCatalogProductRequestsForTests();
  __setClientDbForTests(undefined);
  await db.delete();
});

describe("useDisplayNames — a catalog name not on the device yet (2026-10-12)", () => {
  it("shows nothing (the screen's “…”) while asking the server, then the real name — never the placeholder", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await gate;
        return new Response(JSON.stringify({ products: [{ id: PRODUCT_ID, name: "FLAGYL CAPS 500MG/CAP BTX30" }] }), { status: 200 });
      }),
    );
    const seen: (string | undefined)[] = [];
    const { result } = renderHook(() => {
      const names = useDisplayNames(MEDS);
      seen.push(names.get(med.id));
      return names;
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(result.current.get(med.id)).toBeUndefined();

    release();
    await waitFor(() => expect(result.current.get(med.id)).toBe("FLAGYL 500mg"));
    expect(seen).not.toContain(PLACEHOLDER);
    // Cached on the device: the next visit needs no network.
    expect((await db.catalogProductCache.get(PRODUCT_ID))?.name).toBe("FLAGYL CAPS 500MG/CAP BTX30");
  });

  it("falls back to the placeholder only when the name can't be fetched (offline, server error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { result } = renderHook(() => useDisplayNames(MEDS));
    await waitFor(() => expect(result.current.get(med.id)).toBe(PLACEHOLDER));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
