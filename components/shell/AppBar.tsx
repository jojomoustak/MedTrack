"use client";

import { useState } from "react";
import Link from "next/link";
import { SyncStatusChip } from "@/components/sync/SyncStatusChip";
import { useGlobalSyncSummary } from "@/lib/sync/client/use-global-sync-summary";
import { createSyncManager } from "@/lib/sync/client/sync-manager";

/**
 * Phase 3 §1's app bar: title + sync-status summary, tappable to Profile
 * (a full "Sync & Data" screen is a later phase).
 *
 * UX audit (2026-09-18): `failed` is the one state this hook can actually
 * produce whose chip config claims "tap to retry" (`sync-state-config.ts`)
 * — found rendering as a non-interactive `<Link>` with nothing behind the
 * promised retry, `SyncStatusChip`'s own doc comment calls that exact
 * situation a defect. Fixed here rather than by building the full "Sync &
 * Data" screen this chip is meant to eventually open (out of scope for a
 * polish pass) — a one-off `createSyncManager().drainNow()` is safe to
 * call standalone: it reads/writes the same persisted Dexie outbox tables
 * every manager instance shares, it's never `.start()`ed so it leaves no
 * subscriptions/timers behind, and `useGlobalSyncSummary`'s own 5s poll
 * picks up the result without this component needing its own refresh
 * plumbing.
 */
export function AppBar() {
  const summary = useGlobalSyncSummary();
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await createSyncManager().drainNow();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <header className="flex min-h-12 items-center justify-between border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-black">
      <span className="font-semibold">MedTracking</span>
      {summary === "failed" ? (
        <SyncStatusChip state={summary} onRetry={retrying ? undefined : handleRetry} />
      ) : (
        summary && (
          <Link href="/profile" aria-label="Κατάσταση συγχρονισμού">
            <SyncStatusChip state={summary} />
          </Link>
        )
      )}
    </header>
  );
}
