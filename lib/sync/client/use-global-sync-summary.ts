"use client";

import { useEffect, useState } from "react";
import { getClientDb } from "@/lib/db-client/dexie";
import type { SyncState } from "@/lib/domain/sync";

/**
 * The app-bar "global summary" chip's state (Phase 3 §5: "a single small
 * indicator in the app bar... tappable, opening Sync & Data") — derived
 * from the outbox itself rather than a separate aggregation table.
 * `failed` outranks `conflict` outranks `pending`/`syncing` outranks
 * nothing-to-show, matching "conflict and failed... never allowed to
 * silently disappear."
 */
export function useGlobalSyncSummary(): SyncState | null {
  const [state, setState] = useState<SyncState | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const db = getClientDb();
        const entries = await db.outbox.toArray();
        if (cancelled) return;
        if (entries.length === 0) {
          setState(null);
          return;
        }
        if (entries.some((e) => e.status === "failed")) setState("failed");
        else if (entries.some((e) => e.status === "syncing")) setState("syncing");
        else setState("pending");
      } catch {
        // getClientDb() throws outside a browser context — nothing to show yet.
        if (!cancelled) setState(null);
      }
    }

    void refresh();
    const interval = setInterval(() => void refresh(), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return state;
}
