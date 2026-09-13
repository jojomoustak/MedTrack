/**
 * Dispatches a server mutation result back into the right entity
 * repository — the one place that knows "entity type X's applyRemote/
 * markConflict/markFailed live on repository Y". Kept separate from
 * `worker.ts` so the worker itself stays entity-agnostic and tests can
 * inject a trivial fake here without needing real Dexie repositories.
 *
 * Real gap found (2026-09-13, while building `/medications/[id]/edit`):
 * `userMedication` had never had a case here at all — every create
 * mutation's ack silently fell into `default`'s warn log, so a
 * medication's local `syncState` never actually became `"synced"` via
 * its own outbox entry; it only self-healed once the NEXT unrelated
 * pull happened to include it (`hydrate-local-data.ts` DOES handle
 * `userMedication`, which is why this was never visibly broken end to
 * end). Worse for an update once `UserMedicationRepository.update`
 * existed: a genuine version conflict would never have been marked
 * `syncState: "conflict"` (Phase 1 §5's "surfaced conflict on true
 * divergence" rule) — the losing edit would just silently vanish on the
 * next pull with no signal to the user at all. Added below, same
 * optimistic-concurrency shape as `medicationPackage`.
 */
import type { OutboxEntry } from "@/lib/domain/outbox";
import type { PurchaseListItemRecord, PurchaseListRecord, UserPreferencesRecord } from "@/lib/domain/entities";
import type {
  DoseEventRepository,
  FavoriteRepository,
  InventoryTransactionRepository,
  MedicationPackageRepository,
  MedicationScheduleRepository,
  PurchaseListItemRepository,
  PurchaseListRepository,
  RecentlyUsedEventRepository,
  UserMedicationRepository,
  UserPreferencesRepository,
} from "@/lib/domain/repositories";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import type { MedicationPackageRecord } from "@/lib/domain/medication-package";
import type { InventoryTransactionRecord } from "@/lib/domain/inventory-transaction";
import type { FavoriteRecord } from "@/lib/domain/favorite";
import type { RecentlyUsedEventRecord } from "@/lib/domain/recently-used-event";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import type { SyncMutationResult } from "@/lib/sync/protocol";
import { reconcileDoseEventsForSchedule } from "@/lib/scheduling/client/dose-event-generator";
import { logger } from "@/lib/logging/logger";

export interface ApplyResultDeps {
  userPreferences: UserPreferencesRepository;
  purchaseList: PurchaseListRepository;
  purchaseListItem?: PurchaseListItemRepository;
  userMedication?: UserMedicationRepository;
  medicationSchedule?: MedicationScheduleRepository;
  doseEvent?: DoseEventRepository;
  medicationPackage?: MedicationPackageRepository;
  inventoryTransaction?: InventoryTransactionRepository;
  favorite?: FavoriteRepository;
  recentlyUsedEvent?: RecentlyUsedEventRepository;
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
      case "purchaseListItem": {
        if (!deps.purchaseListItem) {
          logger.warn("sync.applyResult.missing_dep", { entityType: entry.entityType });
          return;
        }
        if (result.result === "applied" && result.serverRecord) {
          await deps.purchaseListItem.applyRemote(result.serverRecord as unknown as PurchaseListItemRecord);
        } else if (result.result === "conflict") {
          await deps.purchaseListItem.markConflict(entry.entityId);
        } else {
          await deps.purchaseListItem.markFailed(entry.entityId);
        }
        return;
      }
      case "userMedication": {
        if (!deps.userMedication) {
          logger.warn("sync.applyResult.missing_dep", { entityType: entry.entityType });
          return;
        }
        if (result.result === "applied" && result.serverRecord) {
          await deps.userMedication.applyRemote(result.serverRecord as unknown as UserMedicationRecord);
        } else if (result.result === "conflict") {
          await deps.userMedication.markConflict(entry.entityId);
        } else {
          await deps.userMedication.markFailed(entry.entityId);
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
      case "medicationPackage": {
        if (!deps.medicationPackage) {
          logger.warn("sync.applyResult.missing_dep", { entityType: entry.entityType });
          return;
        }
        if (result.result === "applied" && result.serverRecord) {
          await deps.medicationPackage.applyRemote(result.serverRecord as unknown as MedicationPackageRecord);
        } else if (result.result === "conflict") {
          await deps.medicationPackage.markConflict(entry.entityId);
        } else {
          await deps.medicationPackage.markFailed(entry.entityId);
        }
        return;
      }
      case "medicationInventoryTransaction": {
        if (!deps.inventoryTransaction) {
          logger.warn("sync.applyResult.missing_dep", { entityType: entry.entityType });
          return;
        }
        if (result.serverRecord) {
          await deps.inventoryTransaction.applyRemote(result.serverRecord as unknown as InventoryTransactionRecord);
        }
        if (result.result !== "applied") {
          // Append-only ledger, idempotent-by-id -- same reasoning as
          // doseEvent above: the server never returns 'conflict' here.
          await deps.inventoryTransaction.markFailed(entry.entityId);
        }
        return;
      }
      case "favorite": {
        if (!deps.favorite) {
          logger.warn("sync.applyResult.missing_dep", { entityType: entry.entityType });
          return;
        }
        if (result.result === "applied" && result.serverRecord) {
          await deps.favorite.applyRemote(result.serverRecord as unknown as FavoriteRecord);
        }
        // favorite is LWW/no-conflict-UI, same reasoning as userPreferences
        // above — nothing else to do even on a non-applied result.
        return;
      }
      case "recentlyUsedEvent": {
        if (!deps.recentlyUsedEvent) {
          logger.warn("sync.applyResult.missing_dep", { entityType: entry.entityType });
          return;
        }
        if (result.serverRecord) {
          await deps.recentlyUsedEvent.applyRemote(result.serverRecord as unknown as RecentlyUsedEventRecord);
        }
        if (result.result !== "applied") {
          // Idempotent-by-id insert, same reasoning as doseEvent above --
          // the server never returns 'conflict' here.
          await deps.recentlyUsedEvent.markFailed(entry.entityId);
        }
        return;
      }
      default:
        logger.warn("sync.applyResult.unhandled_entity_type", { entityType: entry.entityType });
    }
  };
}
