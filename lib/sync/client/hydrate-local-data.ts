/**
 * One-shot "pull whatever this profile's server state already has and
 * merge it into the local Dexie cache" — reuses Phase 5/6's existing
 * `pullChanges`/`applyRemote` primitives directly, not new sync
 * architecture. Needed so a fresh page load (e.g. after a deploy, a
 * reload mid-demo, or a second device/reinstall) shows data that was
 * created in an earlier session/tab, not just whatever happens to already
 * be in this browser's IndexedDB. Best-effort: any failure (offline,
 * network) is swallowed — the local-first read the caller already does is
 * the source of truth for the offline case, per `designing-offline-sync`.
 *
 * Originally `hydrateUserMedicationsFromServer` (UserMedication only) —
 * broadened for Phase 10 after live-device testing (2026-08-30) found the
 * gap directly: a MedicationSchedule/DoseEvent created via the outbox on
 * one device synced to the server fine, but a `pullChanges` response
 * carrying that same schedule/dose (e.g. on a second device, or this
 * device after a reinstall) was silently dropped here — the loop below
 * only ever matched `change.entityType === "userMedication"`, so anything
 * else in the pulled batch was read and discarded. `changes.ts` already
 * hydrates a full record for medicationSchedule/doseEvent; this was the
 * one place that never consumed it.
 */
import { pullChanges } from "@/lib/sync/client/api";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { DexieMedicationPackageRepository } from "@/lib/db-client/medication-package-repository";
import { DexieInventoryTransactionRepository } from "@/lib/db-client/inventory-transaction-repository";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import type { MedicationPackageRecord } from "@/lib/domain/medication-package";
import type { InventoryTransactionRecord } from "@/lib/domain/inventory-transaction";
import { logger } from "@/lib/logging/logger";

export interface HydrateLocalDataDeps {
  userMedication?: DexieUserMedicationRepository;
  medicationSchedule?: DexieMedicationScheduleRepository;
  doseEvent?: DexieDoseEventRepository;
  medicationPackage?: DexieMedicationPackageRepository;
  inventoryTransaction?: DexieInventoryTransactionRepository;
  /** Injectable for tests — defaults to the real `pullChanges` (which calls the network). */
  pullChanges?: typeof pullChanges;
}

export async function hydrateLocalDataFromServer(deps: HydrateLocalDataDeps = {}): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  const userMedication = deps.userMedication ?? new DexieUserMedicationRepository();
  const medicationSchedule = deps.medicationSchedule ?? new DexieMedicationScheduleRepository();
  const doseEvent = deps.doseEvent ?? new DexieDoseEventRepository();
  const medicationPackage = deps.medicationPackage ?? new DexieMedicationPackageRepository();
  const inventoryTransaction = deps.inventoryTransaction ?? new DexieInventoryTransactionRepository();
  const pull = deps.pullChanges ?? pullChanges;

  try {
    let cursor = 0;
    // Bounded — this is a "catch up this session" pass, not a full
    // paginated sync loop (Phase 5's outbox worker owns ongoing sync).
    for (let page = 0; page < 10; page++) {
      const response = await pull(cursor);
      for (const change of response.changes) {
        if (!change.record) continue;
        if (change.entityType === "userMedication") {
          await userMedication.applyRemote(change.record as unknown as UserMedicationRecord);
        } else if (change.entityType === "medicationSchedule") {
          await medicationSchedule.applyRemote(change.record as unknown as MedicationScheduleRecord);
        } else if (change.entityType === "doseEvent") {
          await doseEvent.applyRemote(change.record as unknown as DoseEventRecord);
        } else if (change.entityType === "medicationPackage") {
          await medicationPackage.applyRemote(change.record as unknown as MedicationPackageRecord);
        } else if (change.entityType === "medicationInventoryTransaction") {
          await inventoryTransaction.applyRemote(change.record as unknown as InventoryTransactionRecord);
        }
      }
      if (response.nextCursor === cursor || response.changes.length === 0) break;
      cursor = response.nextCursor;
    }
  } catch (err) {
    logger.warn("sync.hydrate.local_data_failed", { message: (err as Error).message });
  }
}
