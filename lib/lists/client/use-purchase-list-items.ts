"use client";

import { useCallback, useEffect, useState } from "react";
import { newId } from "@/lib/domain/ids";
import { DexiePurchaseListItemRepository } from "@/lib/db-client/purchase-list-item-repository";
import type { PurchaseListItemRecord } from "@/lib/domain/entities";
import { logger } from "@/lib/logging/logger";

export interface AddPurchaseListItemInput {
  label?: string | null;
  userMedicationId?: string | null;
  estimatedUnitPriceCents?: number | null;
}

export interface PurchaseListItemsState {
  status: "loading" | "ready";
  /** All non-deleted items, `createdAt` ascending — the UI segments pending/purchased/removed by `status`. */
  items: PurchaseListItemRecord[];
  addItem: (input: AddPurchaseListItemInput) => Promise<void>;
  markPurchased: (id: string, actualPaidPriceCents?: number | null) => Promise<void>;
  markPending: (id: string) => Promise<void>;
  markRemoved: (id: string) => Promise<void>;
  /** Permanently deletes the row (Phase 2 §4.A tombstone) — distinct from `markRemoved`, which just crosses it off. */
  deleteItem: (id: string) => Promise<void>;
  refresh: () => void;
}

/** Backs `/lists/[id]` (Phase 3 §2.7, Phase 13) — one purchase list's items. */
export function usePurchaseListItems(purchaseListId: string | null, profileId: string | null): PurchaseListItemsState {
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [items, setItems] = useState<PurchaseListItemRecord[]>([]);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!purchaseListId) return;
    let cancelled = false;

    async function load() {
      const repo = new DexiePurchaseListItemRepository();
      const all = await repo.listByPurchaseList(purchaseListId!);
      if (cancelled) return;
      setItems(all);
      setStatus("ready");
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [purchaseListId, nonce]);

  const addItem = useCallback(
    async (input: AddPurchaseListItemInput) => {
      if (!purchaseListId || !profileId) return;
      try {
        const repo = new DexiePurchaseListItemRepository();
        await repo.create({
          id: newId(),
          clientMutationId: newId(),
          purchaseListId,
          profileId,
          userMedicationId: input.userMedicationId ?? null,
          label: input.label ?? null,
          estimatedUnitPriceCents: input.estimatedUnitPriceCents ?? null,
        });
        refresh();
      } catch (err) {
        logger.warn("lists.add_item_failed", { message: err instanceof Error ? err.message : String(err) });
      }
    },
    [purchaseListId, profileId, refresh],
  );

  const markPurchased = useCallback(
    async (id: string, actualPaidPriceCents?: number | null) => {
      try {
        const repo = new DexiePurchaseListItemRepository();
        await repo.update(id, { status: "purchased", purchasedAt: new Date().toISOString(), actualPaidPriceCents: actualPaidPriceCents ?? undefined }, newId());
        refresh();
      } catch (err) {
        logger.warn("lists.mark_purchased_failed", { message: err instanceof Error ? err.message : String(err) });
      }
    },
    [refresh],
  );

  const markPending = useCallback(
    async (id: string) => {
      try {
        const repo = new DexiePurchaseListItemRepository();
        await repo.update(id, { status: "pending", purchasedAt: null }, newId());
        refresh();
      } catch (err) {
        logger.warn("lists.mark_pending_failed", { message: err instanceof Error ? err.message : String(err) });
      }
    },
    [refresh],
  );

  const markRemoved = useCallback(
    async (id: string) => {
      try {
        const repo = new DexiePurchaseListItemRepository();
        await repo.update(id, { status: "removed" }, newId());
        refresh();
      } catch (err) {
        logger.warn("lists.mark_removed_failed", { message: err instanceof Error ? err.message : String(err) });
      }
    },
    [refresh],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      try {
        const repo = new DexiePurchaseListItemRepository();
        await repo.remove(id, newId());
        refresh();
      } catch (err) {
        logger.warn("lists.delete_item_failed", { message: err instanceof Error ? err.message : String(err) });
      }
    },
    [refresh],
  );

  return { status, items, addItem, markPurchased, markPending, markRemoved, deleteItem, refresh };
}
