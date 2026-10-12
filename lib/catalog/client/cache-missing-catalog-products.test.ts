import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetCatalogProductRequestsForTests,
  cacheMissingCatalogProducts,
  isCatalogProductRequestPending,
} from "@/lib/catalog/client/cache-missing-catalog-products";
import { onOfflineIndexUpdated } from "@/lib/catalog/client/offline-index-signal";
import type { CatalogProduct } from "@/lib/domain/catalog";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";

function product(id: string, name: string): CatalogProduct {
  return { id, name } as CatalogProduct;
}

function fakeCache(known: CatalogProduct[] = []) {
  const stored = new Map(known.map((p) => [p.id, p]));
  return {
    stored,
    get: vi.fn(async (id: string) => stored.get(id) ?? null),
    cacheAll: vi.fn(async (products: readonly CatalogProduct[]) => {
      for (const p of products) stored.set(p.id, p);
    }),
  };
}

function fakeIndex(knownIds: string[] = []) {
  return { getById: vi.fn(async (id: string) => (knownIds.includes(id) ? ({ id, name: "indexed" } as never) : null)) };
}

function respondWith(products: CatalogProduct[]) {
  return vi.fn(async () => new Response(JSON.stringify({ products }), { status: 200 }));
}

afterEach(() => {
  __resetCatalogProductRequestsForTests();
});

describe("cacheMissingCatalogProducts", () => {
  it("asks the server only for products the device has nowhere, caches them and says so (2026-10-12)", async () => {
    const cache = fakeCache([product(ID_A, "IN CACHE")]);
    const offlineIndex = fakeIndex([ID_B]);
    const fetchImpl = respondWith([product(ID_C, "FLAGYL CAPS 500MG/CAP BTX30")]);
    const heard = vi.fn();
    const stop = onOfflineIndexUpdated(heard);

    const cached = await cacheMissingCatalogProducts([ID_A, ID_B, ID_C, ID_C], { cache, offlineIndex, fetchImpl });
    stop();

    expect(cached).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]), "http://x");
    expect(url.pathname).toBe("/api/catalog/products");
    expect(url.searchParams.get("ids")).toBe(ID_C);
    expect(cache.stored.get(ID_C)?.name).toBe("FLAGYL CAPS 500MG/CAP BTX30");
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("makes no request when everything is already on the device", async () => {
    const fetchImpl = respondWith([]);
    const cached = await cacheMissingCatalogProducts([ID_A, ID_B], { cache: fakeCache([product(ID_A, "A")]), offlineIndex: fakeIndex([ID_B]), fetchImpl });
    expect(cached).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a second caller for the same product waits for the first request instead of sending another", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fetchImpl = vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify({ products: [product(ID_A, "A")] }), { status: 200 });
    });
    const cache = fakeCache();
    const offlineIndex = fakeIndex();

    const first = cacheMissingCatalogProducts([ID_A], { cache, offlineIndex, fetchImpl });
    await vi.waitFor(() => expect(isCatalogProductRequestPending(ID_A)).toBe(true));
    let secondDone = false;
    const second = cacheMissingCatalogProducts([ID_A], { cache, offlineIndex, fetchImpl }).then((n) => {
      secondDone = true;
      return n;
    });
    await Promise.resolve();
    expect(secondDone).toBe(false);

    release();
    expect(await first).toBe(1);
    expect(await second).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(isCatalogProductRequestPending(ID_A)).toBe(false);
  });

  it("never throws: offline or a server error caches nothing, and a later call tries again", async () => {
    const cache = fakeCache();
    const offlineIndex = fakeIndex();
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await cacheMissingCatalogProducts([ID_A], { cache, offlineIndex, fetchImpl: offline })).toBe(0);
    const serverError = vi.fn(async () => new Response("{}", { status: 500 }));
    expect(await cacheMissingCatalogProducts([ID_A], { cache, offlineIndex, fetchImpl: serverError })).toBe(0);
    expect(cache.cacheAll).not.toHaveBeenCalled();

    const fetchImpl = respondWith([product(ID_A, "A")]);
    expect(await cacheMissingCatalogProducts([ID_A], { cache, offlineIndex, fetchImpl })).toBe(1);
  });

  it("gives up on a request that hangs, so a restore never waits on it forever", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const cached = await cacheMissingCatalogProducts([ID_A], { cache: fakeCache(), offlineIndex: fakeIndex(), fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20 });
    expect(cached).toBe(0);
    expect(isCatalogProductRequestPending(ID_A)).toBe(false);
  });
});
