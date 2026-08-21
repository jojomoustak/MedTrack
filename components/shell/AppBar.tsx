"use client";

import Link from "next/link";
import { SyncStatusChip } from "@/components/sync/SyncStatusChip";
import { useGlobalSyncSummary } from "@/lib/sync/client/use-global-sync-summary";

/** Phase 3 §1's app bar: title + sync-status summary, tappable to Profile (a full "Sync & Data" screen is a later phase). */
export function AppBar() {
  const summary = useGlobalSyncSummary();

  return (
    <header className="flex min-h-12 items-center justify-between border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-black">
      <span className="font-semibold">MedTracking</span>
      {summary && (
        <Link href="/profile" aria-label="Κατάσταση συγχρονισμού">
          <SyncStatusChip state={summary} />
        </Link>
      )}
    </header>
  );
}
