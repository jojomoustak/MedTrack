import { newId } from "@/lib/domain/ids";
import { reconcileDoseEventsForSchedule } from "@/lib/scheduling/client/dose-event-generator";
import { syncNativeRemindersNow } from "@/lib/reminders/client/native-reminder-sync";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import { MedianMobilePlatform } from "@/lib/platform/median-mobile-platform";
import { logger } from "@/lib/logging/logger";

/**
 * `/medications/[id]/edit`'s "danger zone" delete action. A bare
 * `UserMedicationRepository.softDelete()` would only hide the medication
 * itself — its active `MedicationSchedule` row(s) would keep generating
 * future `DoseEvent`s and, worse, their already-armed native
 * `AlarmManager` alarms would keep firing forever for a "deleted"
 * medication, since nothing else would ever tell native to cancel them
 * (the exact reminder-reliability failure mode this whole project has
 * spent real effort chasing down in other forms). This orchestrates the
 * full cascade in the correct order: soft-delete the medication, then
 * every active schedule for it, reconciling (cancelling) each schedule's
 * future non-terminal dose events as it goes, then one native-reminder
 * reconcile pass so those cancellations actually reach `AlarmManager`.
 *
 * Deliberately does NOT touch `MedicationPackage`/`InventoryTransaction`
 * rows (append-only ledger history, Phase 2 §4.A — a deleted medication's
 * past inventory facts stay exactly as real as any other historical
 * record) or `Favorite`/`PurchaseListItem` rows referencing it (both
 * already degrade gracefully: a stale favorite simply can't match
 * anything once `UserMedicationRepository.list()` excludes the deleted
 * row; a purchase-list item linked to it keeps its own `label`/id and is
 * a known, low-priority display gap — `itemDisplayName` shows "…" for a
 * linked-but-now-invisible medication — rather than a data-integrity
 * issue).
 */
export async function deleteMedicationWithCascade(profileId: string, userMedicationId: string): Promise<void> {
  const userMedicationRepo = new DexieUserMedicationRepository();
  const scheduleRepo = new DexieMedicationScheduleRepository();
  const doseEventRepo = new DexieDoseEventRepository();

  await userMedicationRepo.softDelete(userMedicationId, newId());

  const schedules = await scheduleRepo.listByUserMedication(userMedicationId);
  for (const schedule of schedules) {
    if (schedule.deletedAt !== null) continue;
    await scheduleRepo.softDelete(schedule.id, newId());
    const deletedSchedule = await scheduleRepo.get(schedule.id);
    if (deletedSchedule) {
      await reconcileDoseEventsForSchedule(deletedSchedule, doseEventRepo);
    }
  }

  try {
    await syncNativeRemindersNow(profileId, {
      doseEvents: doseEventRepo,
      userMedications: userMedicationRepo,
      catalogCache: new DexieCatalogCacheRepository(),
      offlineIndex: new DexieOfflineIndexRepository(),
      platform: new MedianMobilePlatform(),
    });
  } catch (err) {
    // Best-effort, same reasoning as `today/page.tsx`'s own
    // `pushNativeRemindersAfterTransition` — the schedule/dose-event
    // cancellation above already committed regardless; a failure here
    // just means the native alarm cancellation waits for the next
    // periodic reconcile tick instead of happening immediately.
    logger.warn("medications.delete_native_reminder_sync_failed", { message: err instanceof Error ? err.message : String(err) });
  }
}
