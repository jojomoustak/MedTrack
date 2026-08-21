/**
 * Dispatches a server mutation result back into the right entity
 * repository — the one place that knows "entity type X's applyRemote/
 * markConflict/markFailed live on repository Y". Kept separate from
 * `worker.ts` so the worker itself stays entity-agnostic and tests can
 * inject a trivial fake here without needing real Dexie repositories.
 */
import type { OutboxEntry } from "@/lib/domain/outbox";
import type { PurchaseListRecord, UserPreferencesRecord } from "@/lib/domain/entities";
import type { PurchaseListRepository, UserPreferencesRepository } from "@/lib/domain/repositories";
import type { SyncMutationResult } from "@/lib/sync/protocol";
import { logger } from "@/lib/logging/logger";

export interface ApplyResultDeps {
  userPreferences: UserPreferencesRepository;
  purchaseList: PurchaseListRepository;
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
      default:
        logger.warn("sync.applyResult.unhandled_entity_type", { entityType: entry.entityType });
    }
  };
}
