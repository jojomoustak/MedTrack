// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import { usePurchaseLists } from "@/lib/lists/client/use-purchase-lists";
import { usePurchaseListSummaries } from "@/lib/lists/client/use-purchase-list-summaries";
import { usePurchaseListItems } from "@/lib/lists/client/use-purchase-list-items";
import { MedTrackingDexie, __setClientDbForTests } from "@/lib/db-client/dexie";
import { clearSnapshots } from "@/lib/client-cache/snapshot";
import { notifyLocalDataHydrated } from "@/lib/sync/client/local-data-signal";
import type { PurchaseListItemRecord, PurchaseListRecord } from "@/lib/domain/entities";

const PROFILE_ID = crypto.randomUUID();

let db: MedTrackingDexie;

beforeEach(() => {
  db = new MedTrackingDexie(`test-use-purchase-lists-${crypto.randomUUID()}`);
  __setClientDbForTests(db);
  clearSnapshots();
});

afterEach(async () => {
  cleanup();
  __setClientDbForTests(undefined);
  await db.delete();
});

/** What a server pull writes: a synced row, no outbox entry. */
function pulledList(name: string): PurchaseListRecord {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), profileId: PROFILE_ID, name, isArchived: false, createdAt: now, updatedAt: now, version: 1, deletedAt: null, clientMutationId: crypto.randomUUID(), syncState: "synced" };
}

function pulledItem(purchaseListId: string, label: string): PurchaseListItemRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    purchaseListId,
    profileId: PROFILE_ID,
    userMedicationId: null,
    label,
    quantityValue: null,
    quantityUnit: null,
    estimatedUnitPriceCents: null,
    actualPaidPriceCents: null,
    currency: "EUR",
    status: "pending",
    purchasedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
    deletedAt: null,
    clientMutationId: crypto.randomUUID(),
    syncState: "synced",
  };
}

// Owner-reported 2026-10-17: on a phone just signed in, Lists showed «no lists» and stayed so until the tab was reopened.
describe("list screens re-read when data arrives from the server", () => {
  it("the lists, and their item counts, refresh after a pull", async () => {
    const { result } = renderHook(() => {
      const lists = usePurchaseLists(PROFILE_ID);
      return { lists, summaries: usePurchaseListSummaries(lists.lists) };
    });
    await waitFor(() => expect(result.current.lists.status).toBe("ready"));
    expect(result.current.lists.lists).toEqual([]);

    const list = pulledList("Φαρμακείο");
    await db.purchaseList.put(list);
    await db.purchaseListItem.bulkPut([pulledItem(list.id, "Βαμβάκι"), pulledItem(list.id, "Γάζες")]);
    act(() => notifyLocalDataHydrated("pull"));

    await waitFor(() => expect(result.current.lists.lists.map((l) => l.name)).toEqual(["Φαρμακείο"]));
    await waitFor(() => expect(result.current.summaries.summaries.get(list.id)?.itemCount).toBe(2));
  });

  it("a list deleted on another device goes away from the open screen", async () => {
    const list = pulledList("Φαρμακείο");
    await db.purchaseList.put(list);
    const { result } = renderHook(() => usePurchaseLists(PROFILE_ID));
    await waitFor(() => expect(result.current.lists).toHaveLength(1));

    await db.purchaseList.put({ ...list, deletedAt: new Date().toISOString(), version: 2 });
    act(() => notifyLocalDataHydrated("pull-progress"));

    await waitFor(() => expect(result.current.lists).toEqual([]));
  });

  it("a list's items refresh after a pull", async () => {
    const list = pulledList("Φαρμακείο");
    await db.purchaseList.put(list);
    const { result } = renderHook(() => usePurchaseListItems(list.id, PROFILE_ID));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items).toEqual([]);

    await db.purchaseListItem.put(pulledItem(list.id, "Βαμβάκι"));
    act(() => notifyLocalDataHydrated("pull"));

    await waitFor(() => expect(result.current.items.map((i) => i.label)).toEqual(["Βαμβάκι"]));
  });
});
