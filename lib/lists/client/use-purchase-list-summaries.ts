"use client";

import { useEffect, useMemo, useState } from "react";
import { readSnapshot, refreshSnapshot } from "@/lib/client-cache/snapshot";
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
  const listIdsKey = lists.map((l) => l.id).join(",");
  // Starts from what it showed last time (`lib/client-cache/snapshot.ts`) — entries, not a Map, so an unchanged re-read compares equal.
  const snapshotKey = `purchase-list-summaries:${listIdsKey}`;
  const [entries, setEntries] = useState<[string, PurchaseListSummary][] | null>(() => readSnapshot<[string, PurchaseListSummary][]>(snapshotKey) ?? null);
  // A list added or removed: the old summaries no longer describe these lists.
  const [shownKey, setShownKey] = useState(snapshotKey);
  if (shownKey !== snapshotKey) {
    setShownKey(snapshotKey);
    setEntries(readSnapshot<[string, PurchaseListSummary][]>(snapshotKey) ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const repo = new DexiePurchaseListItemRepository();
      const entries = await Promise.all(
        lists.map(async (list) => {
          const items = await repo.listByPurchaseList(list.id);
          const notRemoved = items.filter((i) => i.status !== "removed");
          const completed = notRemoved.length > 0 && notRemoved.every((i) => i.status === "purchased");
          return [list.id, { itemCount: notRemoved.length, completed }] as const;
        }),
      );
      const settled = refreshSnapshot<[string, PurchaseListSummary][]>(snapshotKey, entries.map(([id, summary]) => [id, summary]));
      if (!cancelled) setEntries(settled);
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetches when the actual set of list ids changes (listIdsKey), not on every new `lists` array reference from the parent's own re-renders.
  }, [listIdsKey]);

  const summaries = useMemo(() => new Map(entries ?? []), [entries]);
  return { status: entries ? "ready" : "loading", summaries };
}
