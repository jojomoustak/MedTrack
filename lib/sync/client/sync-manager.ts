/**
 * Wires the network monitor and the outbox itself to the drain worker: a
 * drain attempt fires (a) once at startup, (b) on reconnect, and (c)
 * whenever a new entry is durably written to the outbox (see
 * `lib/sync/client/outbox-signal.ts` — added after a real browser
 * click-through found that (a)+(b) alone left every mutation written
 * *after* the initial drain, while already online, stuck in the outbox
 * forever). A single in-flight guard prevents overlapping drains if
 * `drainNow()` is also called manually (e.g. a "Sync now" button, Phase 3
 * §5's Sync & Data screen) while another drain is already running.
 *
 * Also drives the compact offline-index sync (spec §16/§17/§22) on the
 * same startup+reconnect lifecycle, with its own separate in-flight guard
 * — a large index sync must never block, or be blocked by, outbox
 * draining, since they touch unrelated local tables. Checking the
 * manifest on every start is intentionally cheap (spec §16: "do not
 * redownload the catalog on every application start" — the manifest
 * *check* is not the same cost as the full download, and only a version
 * mismatch triggers the latter).
 */
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";
import { DexiePreferencesRepository } from "@/lib/db-client/user-preferences-repository";
import { DexiePurchaseListRepository } from "@/lib/db-client/purchase-list-repository";
import { createApplyResult } from "@/lib/sync/client/apply-result";
import { drainOutboxFully, type DrainSummary } from "@/lib/sync/client/worker";
import { createNetworkMonitor, type NetworkMonitor, type NetworkState } from "@/lib/sync/client/network";
import { onOutboxWrite } from "@/lib/sync/client/outbox-signal";
import { syncOfflineIndex, type SyncOfflineIndexOutcome } from "@/lib/catalog/client/sync-offline-index";
import { syncLearnedMappings, type SyncLearnedMappingsOutcome } from "@/lib/catalog/client/sync-learned-mappings";
import { logger } from "@/lib/logging/logger";

export interface SyncManager {
  network: NetworkMonitor;
  start(): void;
  stop(): void;
  drainNow(): Promise<DrainSummary | null>;
  syncOfflineIndexNow(): Promise<SyncOfflineIndexOutcome | null>;
  syncLearnedMappingsNow(): Promise<SyncLearnedMappingsOutcome | null>;
}

export function createSyncManager(): SyncManager {
  const outbox = new DexieOutboxRepository();
  const applyResult = createApplyResult({
    userPreferences: new DexiePreferencesRepository(),
    purchaseList: new DexiePurchaseListRepository(),
  });
  const network = createNetworkMonitor();

  let draining = false;
  let syncingOfflineIndex = false;
  let syncingLearnedMappings = false;
  let unsubscribeNetwork: (() => void) | undefined;
  let unsubscribeOutbox: (() => void) | undefined;

  async function drainNow(): Promise<DrainSummary | null> {
    if (draining) return null;
    draining = true;
    try {
      const summary = await drainOutboxFully({ outbox, applyResult });
      if (summary.attempted > 0) {
        logger.info("sync.manager.drained", { ...summary });
      }
      return summary;
    } finally {
      draining = false;
    }
  }

  async function syncOfflineIndexNow(): Promise<SyncOfflineIndexOutcome | null> {
    if (syncingOfflineIndex) return null;
    syncingOfflineIndex = true;
    try {
      const outcome = await syncOfflineIndex(network.getState());
      if (outcome.status === "failed") {
        logger.warn("sync.manager.offline_index_sync_failed", { reason: outcome.reason });
      } else if (outcome.status === "updated") {
        logger.info("sync.manager.offline_index_updated", { recordCount: outcome.recordCount });
      }
      return outcome;
    } finally {
      syncingOfflineIndex = false;
    }
  }

  async function syncLearnedMappingsNow(): Promise<SyncLearnedMappingsOutcome | null> {
    if (syncingLearnedMappings) return null;
    syncingLearnedMappings = true;
    try {
      const outcome = await syncLearnedMappings(network.getState());
      if (outcome.attempted > 0) {
        logger.info("sync.manager.learned_mappings_synced", { ...outcome });
      }
      return outcome;
    } finally {
      syncingLearnedMappings = false;
    }
  }

  return {
    network,
    start() {
      unsubscribeNetwork = network.subscribe((state: NetworkState) => {
        if (state === "online") {
          void drainNow();
          void syncOfflineIndexNow();
          void syncLearnedMappingsNow();
        }
      });
      unsubscribeOutbox = onOutboxWrite(() => void drainNow());
      network.start();
      void drainNow();
      void syncOfflineIndexNow();
      void syncLearnedMappingsNow();
    },
    stop() {
      network.stop();
      unsubscribeNetwork?.();
      unsubscribeOutbox?.();
    },
    drainNow,
    syncOfflineIndexNow,
    syncLearnedMappingsNow,
  };
}
