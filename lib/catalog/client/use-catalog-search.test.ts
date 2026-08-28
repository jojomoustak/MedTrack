// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { useCatalogSearch } from "@/lib/catalog/client/use-catalog-search";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import { MedTrackingDexie, __setClientDbForTests, getClientDb } from "@/lib/db-client/dexie";
import { __setNetworkMonitorForTests } from "@/lib/sync/client/use-network-status";
import type { NetworkMonitor, NetworkState } from "@/lib/sync/client/network";
import type { OfflineIndexEntry } from "@/lib/domain/offline-index";

function fakeNetworkMonitor(state: NetworkState): NetworkMonitor {
  return {
    getState: () => state,
    subscribe: () => () => {},
    checkNow: async () => state,
    start: () => {},
    stop: () => {},
  };
}

const FLAGYL_ENTRY: OfflineIndexEntry = {
  id: "flagyl-1",
  eofCode: "076130401",
  gtin: null,
  gtins: [],
  barcode: "2800761304014",
  name: "FLAGYL CAPS 500MG/CAP BTX30",
  activeIngredient: "METRONIDAZOLE",
  strengthValue: null,
  strengthUnit: null,
  form: null,
  packSizeValue: null,
  packSizeUnit: null,
};

let db: MedTrackingDexie;

beforeEach(() => {
  db = new MedTrackingDexie(`test-catalog-search-${crypto.randomUUID()}`);
  __setClientDbForTests(db);
});

afterEach(async () => {
  cleanup();
  __setNetworkMonitorForTests(undefined);
  vi.restoreAllMocks();
  __setClientDbForTests(undefined);
  await db.delete();
});

describe("useCatalogSearch — offline fallback uses the same compact offline index as scan resolution (spec §23)", () => {
  it("offline: searches the synced offline index by name, not the old seen-products-only cache", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("offline"));
    const repo = new DexieOfflineIndexRepository(getClientDb());
    await repo.replaceAll({ version: "v1", recordCount: 1, generatedAt: "t", syncedAt: "t" }, [FLAGYL_ENTRY]);

    const { result } = renderHook(() => useCatalogSearch("flagyl"));

    await waitFor(() => expect(result.current.status).toBe("offline-cache"));
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0].name).toBe(FLAGYL_ENTRY.name);
    expect(result.current.results[0].activeIngredient).toBe("METRONIDAZOLE");
  });

  it("offline: also matches by active ingredient", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("offline"));
    const repo = new DexieOfflineIndexRepository(getClientDb());
    await repo.replaceAll({ version: "v1", recordCount: 1, generatedAt: "t", syncedAt: "t" }, [FLAGYL_ENTRY]);

    const { result } = renderHook(() => useCatalogSearch("metronidazole"));

    await waitFor(() => expect(result.current.status).toBe("offline-cache"));
    expect(result.current.results).toHaveLength(1);
  });

  it("offline: a never-before-scanned-on-this-device product still resolves via search, as long as the index was synced", async () => {
    // No prior "seen" cache entry exists for this product at all — only
    // the proactively-synced offline index has it (spec §22's point,
    // exercised here for search rather than scan).
    __setNetworkMonitorForTests(fakeNetworkMonitor("offline"));
    const repo = new DexieOfflineIndexRepository(getClientDb());
    await repo.replaceAll({ version: "v1", recordCount: 1, generatedAt: "t", syncedAt: "t" }, [FLAGYL_ENTRY]);

    const { result } = renderHook(() => useCatalogSearch("flagyl"));

    await waitFor(() => expect(result.current.results.length).toBeGreaterThan(0));
  });

  it("offline + no matches in the synced index: empty results, never a guess", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("offline"));
    const repo = new DexieOfflineIndexRepository(getClientDb());
    await repo.replaceAll({ version: "v1", recordCount: 1, generatedAt: "t", syncedAt: "t" }, [FLAGYL_ENTRY]);

    const { result } = renderHook(() => useCatalogSearch("sportgel"));

    await waitFor(() => expect(result.current.status).toBe("offline-cache"));
    expect(result.current.results).toEqual([]);
  });

  it("query shorter than the minimum length: idle, no search performed at all", () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("offline"));
    const { result } = renderHook(() => useCatalogSearch("a"));
    expect(result.current).toEqual({ status: "idle", results: [] });
  });
});
