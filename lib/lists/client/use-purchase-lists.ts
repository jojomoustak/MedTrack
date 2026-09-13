"use client";

import { useCallback, useEffect, useState } from "react";
import { newId } from "@/lib/domain/ids";
import { DexiePurchaseListRepository } from "@/lib/db-client/purchase-list-repository";
import type { PurchaseListRecord } from "@/lib/domain/entities";
import { logger } from "@/lib/logging/logger";

export interface PurchaseListsState {
  status: "loading" | "ready";
  /** Non-archived lists, most-recently-created first. */
  lists: PurchaseListRecord[];
  createList: (name: string) => Promise<PurchaseListRecord | null>;
  refresh: () => void;
}

/** Backs `/lists` (Phase 3 §2.7, Phase 13) — the purchase-lists overview. */
export function usePurchaseLists(profileId: string | null): PurchaseListsState {
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [lists, setLists] = useState<PurchaseListRecord[]>([]);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    async function load() {
      const repo = new DexiePurchaseListRepository();
      const all = await repo.list(profileId!);
      if (cancelled) return;
      const active = all.filter((l) => !l.isArchived).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setLists(active);
      setStatus("ready");
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId, nonce]);

  const createList = useCallback(
    async (name: string) => {
      if (!profileId) return null;
      const trimmed = name.trim();
      if (!trimmed) return null;

      try {
        const repo = new DexiePurchaseListRepository();
        const created = await repo.create({ id: newId(), profileId, name: trimmed, clientMutationId: newId() });
        refresh();
        return created;
      } catch (err) {
        logger.warn("lists.create_list_failed", { message: err instanceof Error ? err.message : String(err) });
        return null;
      }
    },
    [profileId, refresh],
  );

  return { status, lists, createList, refresh };
}
