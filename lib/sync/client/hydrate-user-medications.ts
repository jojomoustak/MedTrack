/**
 * One-shot "pull whatever this profile's server state already has and
 * merge it into the local Dexie cache" for `UserMedication` — reuses
 * Phase 5/6's existing `pullChanges`/`applyRemote` primitives directly,
 * not new sync architecture. Needed so a fresh page load (e.g. after a
 * deploy, or a reload mid-demo) shows medications that were created in an
 * earlier session/tab, not just whatever happens to already be in this
 * browser's IndexedDB. Best-effort: any failure (offline, network) is
 * swallowed — the local-first read the caller already does is the
 * source of truth for the offline case, per `designing-offline-sync`.
 */
import { pullChanges } from "@/lib/sync/client/api";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import { logger } from "@/lib/logging/logger";

export async function hydrateUserMedicationsFromServer(repository: DexieUserMedicationRepository = new DexieUserMedicationRepository()): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  try {
    let cursor = 0;
    // Bounded — this is a "catch up this session" pass, not a full
    // paginated sync loop (Phase 5's outbox worker owns ongoing sync).
    for (let page = 0; page < 10; page++) {
      const response = await pullChanges(cursor);
      for (const change of response.changes) {
        if (change.entityType === "userMedication" && change.record) {
          await repository.applyRemote(change.record as unknown as UserMedicationRecord);
        }
      }
      if (response.nextCursor === cursor || response.changes.length === 0) break;
      cursor = response.nextCursor;
    }
  } catch (err) {
    logger.warn("sync.hydrate.user_medications_failed", { message: (err as Error).message });
  }
}
