"use client";

import { useState } from "react";
import Link from "next/link";
import { SyncStatusChip } from "@/components/sync/SyncStatusChip";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { useGlobalSyncSummary } from "@/lib/sync/client/use-global-sync-summary";
import { createSyncManager } from "@/lib/sync/client/sync-manager";

/**
 * Phase 3 §1's app bar, on every signed-in screen: the shared
 * `ScreenHeader` (back chevron on inner screens, centered wordmark) with
 * the sync-status summary trailing, tappable to Profile.
 *
 * UX audit (2026-09-18): `failed` is the one state this hook can actually
 * produce whose chip config claims "tap to retry" (`sync-state-config.ts`),
 * so it gets a real retry rather than a link with nothing behind the
 * promise. A one-off `createSyncManager().drainNow()` is safe to call
 * standalone: it reads/writes the same persisted Dexie outbox every manager
 * instance shares, it's never `.start()`ed so it leaves no subscriptions or
 * timers behind, and `useGlobalSyncSummary`'s own 5s poll picks up the
 * result.
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

  const trailing =
    summary === "failed" ? (
      <SyncStatusChip state={summary} onRetry={retrying ? undefined : handleRetry} compact />
    ) : summary ? (
      <Link href="/profile" aria-label="Κατάσταση συγχρονισμού">
        <SyncStatusChip state={summary} compact />
      </Link>
    ) : undefined;

  return <ScreenHeader trailing={trailing} />;
}
