/**
 * Dispatches a server mutation result back into the right entity
 * repository — the one place that knows "entity type X's applyRemote/
 * markConflict/markFailed live on repository Y". Kept separate from
 * `worker.ts` so the worker itself stays entity-agnostic and tests can
 * inject a trivial fake here without needing real Dexie repositories.
 */
import type { OutboxEntry } from "@/lib/domain/outbox";
import type { PurchaseListRecord, UserPreferencesRecord } from "@/lib/domain/entities";
import type { DoseEventRepository, MedicationScheduleRepository, PurchaseListRepository, UserPreferencesRepository } from "@/lib/domain/repositories";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import type { SyncMutationResult } from "@/lib/sync/protocol";
import { reconcileDoseEventsForSchedule } from "@/lib/scheduling/client/dose-event-generator";
import { logger } from "@/lib/logging/logger";

export interface ApplyResultDeps {
  userPreferences: UserPreferencesRepository;
  purchaseList: PurchaseListRepository;
  medicationSchedule?: MedicationScheduleRepository;
  doseEvent?: DoseEventRepository;
}

export function createApplyResult(deps: ApplyResultDeps) {
  return async function applyResult(entry: OutboxEntry, result: SyncMutationResult): Promise<void> {
    switch (entry.entityType) {
      case "userPreferences": {
        if (result.result === "applied" && result.serverRecord) {
          await deps.userPreferences.applyRemote(result.serverRecord as unknown as UserPreferencesRecord);
        }
        // userPreferences is LWW/no-conflict-UI (Phase 3 §4) — nothing
        // else to do even on a non-applied result; the next pull will
        // reconcile local state to whatever the server holds.
        return;
      }
      case "purchaseList": {
        if (result.result === "applied" && result.serverRecord) {
          await deps.purchaseList.applyRemote(result.serverRecord as unknown as PurchaseListRecord);
        } else if (result.result === "conflict") {
          await deps.purchaseList.markConflict(entry.entityId);
        } else {
          await deps.purchaseList.markFailed(entry.entityId);
        }
        return;
      }
      case "medicationSchedule": {
        if (!deps.medicationSchedule) {
          logger.warn("sync.applyResult.missing_dep", { entityType: entry.entityType });
          return;
        }
        if (result.result === "applied" && result.serverRecord) {
          const record = result.serverRecord as unknown as MedicationScheduleRecord;
          await deps.medicationSchedule.applyRemote(record);
          // Own mutation's ack (create/update/delete) — reconcile this
          // schedule's materialized DoseEvents against the now-
          // authoritative row (data-architect trigger #4).
          // reconcileDoseEventsForSchedule itself checks `deletedAt`: a
          // soft-deleted schedule gets every future non-terminal instance
          // cancelled and nothing regenerated; an active one gets
          // cancel-stale + top-up.
          if (deps.doseEvent) {
            await reconcileDoseEventsForSchedule(record, deps.doseEvent);
          }
        } else if (result.result === "conflict") {
          await deps.medicationSchedule.markConflict(entry.entityId);
        } else {
          await deps.medicationSchedule.markFailed(entry.entityId);
        }
        return;
      }
      case "doseEvent": {
        if (!deps.doseEvent) {
          logger.warn("sync.applyResult.missing_dep", { entityType: entry.entityType });
          return;
        }
        if (result.serverRecord) {
          await deps.doseEvent.applyRemote(result.serverRecord as unknown as DoseEventRecord);
        }
        if (result.result !== "applied") {
          // The server never returns 'conflict' for this entity
          // (designing-offline-sync) -- anything other than 'applied'
          // here is a genuine network/validation failure.
          await deps.doseEvent.markFailed(entry.entityId);
        }
        return;
      }
      default:
        logger.warn("sync.applyResult.unhandled_entity_type", { entityType: entry.entityType });
    }
  };
}
