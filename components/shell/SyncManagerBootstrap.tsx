"use client";

import { useEffect } from "react";
import { createSyncManager } from "@/lib/sync/client/sync-manager";

/**
 * Starts the Phase 5 outbox worker (drain-on-reconnect + an initial
 * drain) once per app load. Mounted in the root layout — not the `(app)`
 * shell — since `/medications/add` (where the outbox actually gets its
 * first entries) is deliberately outside that shell (Phase 3 §1: a
 * full-screen task flow, not a tab).
 *
 * Found missing by an actual browser click-through: without this, every
 * local write (`lib/db-client/*-repository.ts`) sat in the outbox
 * forever — visible locally, never reaching Postgres — because nothing
 * in the app ever called `createSyncManager().start()`. `drainOutbox`/
 * `drainOutboxFully` were only ever exercised directly by Phase 5's own
 * tests with injected fakes, never wired into the running app.
 */
export function SyncManagerBootstrap() {
  useEffect(() => {
    const manager = createSyncManager();
    manager.start();
    return () => manager.stop();
  }, []);

  useEffect(() => {
    // Requests the "persistent" storage bucket so IndexedDB (the outbox
    // this component drains above) and the service worker's Cache Storage
    // aren't treated as evictable-under-pressure. Found necessary via live
    // Android-device debugging (2026-08-29): on a device with the disk
    // nearly full, Chromium was silently evicting the SW's app-shell cache
    // between sessions -- the origin's own storage usage was a few MB
    // against a 10GB+ quota, so this wasn't a per-origin quota issue, it
    // was global disk-pressure eviction of non-persisted ("best-effort")
    // site data. IndexedDB is subject to the same eviction risk once a
    // device is that full; per CLAUDE.md's priority order (Data integrity
    // ranks above Offline reliability, both above Performance), losing
    // unsynced local writes to storage eviction is worse than the SW cache
    // going cold, so this is requested unconditionally, not just for the
    // offline app shell. No user-facing prompt: the Storage API grants or
    // denies this via browser heuristics, not a permission dialog.
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      void navigator.storage.persist();
    }
  }, []);

  return null;
}
