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

  return null;
}
