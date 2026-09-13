// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import { usePurchaseListItems } from "@/lib/lists/client/use-purchase-list-items";
import { DexiePurchaseListItemRepository } from "@/lib/db-client/purchase-list-item-repository";
import { MedTrackingDexie, __setClientDbForTests } from "@/lib/db-client/dexie";

const PROFILE_ID = crypto.randomUUID();
const LIST_ID = crypto.randomUUID();

let db: MedTrackingDexie;

beforeEach(() => {
  db = new MedTrackingDexie(`test-use-purchase-list-items-${crypto.randomUUID()}`);
  __setClientDbForTests(db);
});

afterEach(async () => {
  cleanup();
  __setClientDbForTests(undefined);
  await db.delete();
});

describe("usePurchaseListItems", () => {
  it("loads existing items for the list", async () => {
    const repo = new DexiePurchaseListItemRepository(db);
    await repo.create({ id: crypto.randomUUID(), clientMutationId: crypto.randomUUID(), purchaseListId: LIST_ID, profileId: PROFILE_ID, label: "Vitamin D" });

    const { result } = renderHook(() => usePurchaseListItems(LIST_ID, PROFILE_ID));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].label).toBe("Vitamin D");
  });

  it("addItem() persists a new pending item", async () => {
    const { result } = renderHook(() => usePurchaseListItems(LIST_ID, PROFILE_ID));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(() => result.current.addItem({ label: "Ibuprofen" }));

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0].label).toBe("Ibuprofen");
    expect(result.current.items[0].status).toBe("pending");
  });

  it("markPurchased() transitions an item to purchased", async () => {
    const { result } = renderHook(() => usePurchaseListItems(LIST_ID, PROFILE_ID));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(() => result.current.addItem({ label: "Ibuprofen" }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    const itemId = result.current.items[0].id;
    await act(() => result.current.markPurchased(itemId, 350));

    await waitFor(() => expect(result.current.items[0].status).toBe("purchased"));
    expect(result.current.items[0].actualPaidPriceCents).toBe(350);
  });

  it("deleteItem() removes the item from the list", async () => {
    const { result } = renderHook(() => usePurchaseListItems(LIST_ID, PROFILE_ID));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(() => result.current.addItem({ label: "Ibuprofen" }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    const itemId = result.current.items[0].id;
    await act(() => result.current.deleteItem(itemId));

    await waitFor(() => expect(result.current.items).toHaveLength(0));
  });
});
