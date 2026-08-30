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
 *
 * Same lifecycle again for the photo outbox (2026-08-29 offline audit) —
 * its own in-flight guard and its own signal (`onPhotoOutboxWrite`,
 * separate from `onOutboxWrite`) since it's a deliberately independent
 * queue (see `lib/medications/client/photo-outbox-worker.ts`).
 *
 * Phase 10 (Scheduling) adds a periodic tick — not event-driven like the
 * others, since there's no "write" to react to for "an hour has passed
 * and a dose is now overdue" — that runs `topUpDoseEventWindow` (extend
 * every active schedule's materialized DoseEvent horizon) and
 * `sweepMissedDoseEvents` (transition overdue non-terminal doses) on
 * startup and every `SCHEDULING_TICK_INTERVAL_MS` while the app stays
 * foregrounded (data-architect design triggers #5/#6,
 * `lib/scheduling/client/dose-event-generator.ts`). Both need a
 * `profileId`, read via `getCachedProfileId()` (no React tree here) —
 * a no-op before first login, same graceful-degradation shape as every
 * other tick in this file.
 */
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";
import { DexiePreferencesRepository } from "@/lib/db-client/user-preferences-repository";
import { DexiePurchaseListRepository } from "@/lib/db-client/purchase-list-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { createApplyResult } from "@/lib/sync/client/apply-result";
import { drainOutboxFully, type DrainSummary } from "@/lib/sync/client/worker";
import { createNetworkMonitor, type NetworkMonitor, type NetworkState } from "@/lib/sync/client/network";
import { onOutboxWrite } from "@/lib/sync/client/outbox-signal";
import { syncOfflineIndex, type SyncOfflineIndexOutcome } from "@/lib/catalog/client/sync-offline-index";
import { syncLearnedMappings, type SyncLearnedMappingsOutcome } from "@/lib/catalog/client/sync-learned-mappings";
import { DexiePhotoOutboxRepository } from "@/lib/medications/client/photo-outbox-repository";
import { DexiePhotoCacheRepository } from "@/lib/medications/client/photo-cache-repository";
import { drainPhotoOutbox, type PhotoDrainSummary } from "@/lib/medications/client/photo-outbox-worker";
import { onPhotoOutboxWrite } from "@/lib/medications/client/photo-outbox-signal";
import { getCachedProfileId } from "@/lib/auth/client/use-current-profile";
import { sweepMissedDoseEvents, topUpDoseEventWindow } from "@/lib/scheduling/client/dose-event-generator";
import { logger } from "@/lib/logging/logger";

/** How often the scheduling tick re-runs while the app stays foregrounded (data-architect design: "every 30-60 min"). */
const SCHEDULING_TICK_INTERVAL_MS = 45 * 60_000;

export interface SyncManager {
  network: NetworkMonitor;
  start(): void;
  stop(): void;
  drainNow(): Promise<DrainSummary | null>;
  syncOfflineIndexNow(): Promise<SyncOfflineIndexOutcome | null>;
  syncLearnedMappingsNow(): Promise<SyncLearnedMappingsOutcome | null>;
  drainPhotoOutboxNow(): Promise<PhotoDrainSummary | null>;
  runSchedulingTickNow(): Promise<void>;
}

export function createSyncManager(): SyncManager {
  const outbox = new DexieOutboxRepository();
  const medicationSchedule = new DexieMedicationScheduleRepository();
  const doseEvent = new DexieDoseEventRepository();
  const applyResult = createApplyResult({
    userPreferences: new DexiePreferencesRepository(),
    purchaseList: new DexiePurchaseListRepository(),
    medicationSchedule,
    doseEvent,
  });
  const network = createNetworkMonitor();
  const photoOutbox = new DexiePhotoOutboxRepository();
  const photoCache = new DexiePhotoCacheRepository();

  let draining = false;
  let syncingOfflineIndex = false;
  let syncingLearnedMappings = false;
  let drainingPhotoOutbox = false;
  let runningSchedulingTick = false;
  let unsubscribeNetwork: (() => void) | undefined;
  let unsubscribeOutbox: (() => void) | undefined;
  let unsubscribePhotoOutbox: (() => void) | undefined;
  let schedulingTickTimer: ReturnType<typeof setInterval> | undefined;

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

  async function drainPhotoOutboxNow(): Promise<PhotoDrainSummary | null> {
    if (drainingPhotoOutbox) return null;
    drainingPhotoOutbox = true;
    try {
      const summary = await drainPhotoOutbox({ outbox: photoOutbox, cache: photoCache });
      if (summary.attempted > 0) {
        logger.info("sync.manager.photo_outbox_drained", { ...summary });
      }
      return summary;
    } finally {
      drainingPhotoOutbox = false;
    }
  }

  async function runSchedulingTickNow(): Promise<void> {
    if (runningSchedulingTick) return;
    const profileId = getCachedProfileId();
    if (!profileId) return; // no-op before first login, same as every other tick here
    runningSchedulingTick = true;
    try {
      await topUpDoseEventWindow(profileId, medicationSchedule, doseEvent);
      const missed = await sweepMissedDoseEvents(profileId, doseEvent);
      if (missed > 0) {
        logger.info("sync.manager.doses_swept_missed", { count: missed });
      }
    } catch (err) {
      logger.warn("sync.manager.scheduling_tick_failed", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      runningSchedulingTick = false;
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
          void drainPhotoOutboxNow();
        }
      });
      unsubscribeOutbox = onOutboxWrite(() => void drainNow());
      unsubscribePhotoOutbox = onPhotoOutboxWrite(() => void drainPhotoOutboxNow());
      network.start();
      void drainNow();
      void syncOfflineIndexNow();
      void syncLearnedMappingsNow();
      void drainPhotoOutboxNow();
      void runSchedulingTickNow();
      schedulingTickTimer = setInterval(() => void runSchedulingTickNow(), SCHEDULING_TICK_INTERVAL_MS);
    },
    stop() {
      network.stop();
      unsubscribeNetwork?.();
      unsubscribeOutbox?.();
      unsubscribePhotoOutbox?.();
      if (schedulingTickTimer) clearInterval(schedulingTickTimer);
    },
    drainNow,
    syncOfflineIndexNow,
    syncLearnedMappingsNow,
    drainPhotoOutboxNow,
    runSchedulingTickNow,
  };
}
