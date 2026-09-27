"use client";

import { useEffect, useState } from "react";
import { DexiePurchaseListItemRepository } from "@/lib/db-client/purchase-list-item-repository";
import type { PurchaseListRecord } from "@/lib/domain/entities";

export interface PurchaseListSummary {
  /** Not-removed item count — what the reference mockup's "3 items" line shows. */
  itemCount: number;
  /** A list with at least one item, none of them still "pending". Empty lists are never completed — there's nothing to have finished. */
  completed: boolean;
}

/**
 * Per-list item counts + completion, for the Lists overview (reference
 * mockup comparison, 2026-09-28: "Active (2)/Completed (1)" tabs and a
 * "3 items" line per list — neither existed before, since `usePurchaseLists`
 * only ever fetched list metadata). `PurchaseListRecord.isArchived` looked
 * like a natural fit for "completed" but has no UI action anywhere that
 * ever sets it, so it would always read every real list as "active" —
 * completion is derived from real item state instead, the only place the
 * fact actually lives today.
 */
export function usePurchaseListSummaries(lists: PurchaseListRecord[]): { status: "loading" | "ready"; summaries: Map<string, PurchaseListSummary> } {
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [summaries, setSummaries] = useState<Map<string, PurchaseListSummary>>(new Map());
  const listIdsKey = lists.map((l) => l.id).join(",");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus("loading");
      const repo = new DexiePurchaseListItemRepository();
      const entries = await Promise.all(
        lists.map(async (list) => {
          const items = await repo.listByPurchaseList(list.id);
          const notRemoved = items.filter((i) => i.status !== "removed");
          const completed = notRemoved.length > 0 && notRemoved.every((i) => i.status === "purchased");
          return [list.id, { itemCount: notRemoved.length, completed }] as const;
        }),
      );
      if (cancelled) return;
      setSummaries(new Map(entries));
      setStatus("ready");
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetches when the actual set of list ids changes (listIdsKey), not on every new `lists` array reference from the parent's own re-renders.
  }, [listIdsKey]);

  return { status, summaries };
}
